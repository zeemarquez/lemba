import type { Request, Response, NextFunction } from 'express';
import { createRemoteJWKSet, jwtVerify } from 'jose';
import { apiKeyAuth } from '../middleware/auth';

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

/**
 * MCP auth: when `MCP_OAUTH_ISSUER_URL` + `MCP_OAUTH_AUDIENCE` are set, accept
 * `Authorization: Bearer` JWTs from that issuer (e.g. Auth0). Otherwise (or as
 * fallback when the bearer is not a valid JWT) use the same rules as `apiKeyAuth`.
 */
export function mcpCombinedAuth(req: Request, res: Response, next: NextFunction): void {
    const issuer = process.env.MCP_OAUTH_ISSUER_URL?.trim();
    const audience = process.env.MCP_OAUTH_AUDIENCE?.trim();
    const apiKey = process.env.API_KEY;

    const bearer = extractBearer(req);
    const headerKey = req.header('x-api-key');

    const tryApiKey = (): void => {
        if (!apiKey) {
            next();
            return;
        }
        const provided = headerKey || bearer || '';
        if (provided && provided === apiKey) {
            next();
            return;
        }
        res.status(401).json({ error: 'Unauthorized', message: 'Missing or invalid API key' });
    };

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
                if (apiKey && (bearer === apiKey || headerKey === apiKey)) {
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

    apiKeyAuth(req, res, next);
}
