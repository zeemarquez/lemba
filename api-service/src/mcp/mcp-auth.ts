import type { Request, Response, NextFunction } from 'express';
import { createRemoteJWKSet, jwtVerify } from 'jose';

function normalizeIssuer(url: string): string {
    return url.endsWith('/') ? url : `${url}/`;
}

let jwks: ReturnType<typeof createRemoteJWKSet> | null = null;
let jwksIssuer: string | null = null;

function getJwks(issuer: string) {
    const i = normalizeIssuer(issuer);
    if (jwks && jwksIssuer === i) return jwks;
    jwksIssuer = i;
    jwks = createRemoteJWKSet(new URL('.well-known/jwks.json', i));
    return jwks;
}

function extractBearer(req: Request): string | undefined {
    const auth = req.header('authorization') || '';
    if (auth.toLowerCase().startsWith('bearer ')) return auth.slice(7).trim();
    return undefined;
}

function looksLikeJwt(token: string): boolean {
    return token.split('.').length === 3;
}

function hasMcpSession(req: Request): boolean {
    const raw = req.headers['mcp-session-id'];
    if (typeof raw === 'string') return raw.length > 0;
    if (Array.isArray(raw)) return Boolean(raw[0]?.length);
    return false;
}

/**
 * MCP-only auth. `API_KEY` is never required on `/mcp` (REST `/v1` still uses `apiKeyAuth` when set).
 *
 * - If `MCP_OAUTH_ISSUER_URL` + `MCP_OAUTH_AUDIENCE` are set: require a valid JWT Bearer,
 *   or an existing `Mcp-Session-Id` (follow-up GET/DELETE/POST), or an optional matching `API_KEY`.
 * - Otherwise: allow anonymous access to MCP.
 */
export function mcpCombinedAuth(req: Request, res: Response, next: NextFunction): void {
    const issuer = process.env.MCP_OAUTH_ISSUER_URL?.trim();
    const audience = process.env.MCP_OAUTH_AUDIENCE?.trim();
    const apiKey = process.env.API_KEY;

    const bearer = extractBearer(req);
    const headerKey = req.header('x-api-key');

    const apiKeyMatches = (): boolean => !!(apiKey && (bearer === apiKey || headerKey === apiKey));

    if (issuer && audience && bearer && looksLikeJwt(bearer)) {
        void (async () => {
            try {
                const iss = normalizeIssuer(issuer);
                await jwtVerify(bearer, getJwks(issuer), {
                    issuer: iss,
                    audience,
                });
                next();
            } catch (e) {
                if (apiKeyMatches()) {
                    next();
                    return;
                }
                const msg = e instanceof Error ? e.message : String(e);
                console.warn('[MCP] JWT verification failed:', msg);
                if (!res.headersSent) {
                    res.status(401).json({ error: 'Unauthorized', message: 'Invalid or expired access token' });
                }
            }
        })();
        return;
    }

    if (apiKeyMatches()) {
        next();
        return;
    }

    if (issuer && audience) {
        if (hasMcpSession(req)) {
            next();
            return;
        }
        res.status(401).json({
            error: 'Unauthorized',
            message: 'Missing access token (Authorization: Bearer) or invalid session',
        });
        return;
    }

    next();
}
