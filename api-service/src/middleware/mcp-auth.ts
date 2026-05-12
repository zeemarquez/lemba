/**
 * MCP `/mcp` auth: optional OAuth 2.0 Bearer JWT (when issuer + audience are
 * configured) first, then the same rules as `apiKeyAuth` (shared key, mme_*).
 */

import type { NextFunction, Request, Response } from 'express';
import { extractToken, resolveApiKeyCredentials } from './auth';
import {
    buildMcpWwwAuthenticateHeader,
    getMcpJwtAuthConfig,
    looksLikeJwtAccessToken,
    verifyMcpBearerJwt,
} from '../lib/mcp-oauth';

function sendMcpUnauthorized(req: Request, res: Response, message: string): void {
    const challenge = buildMcpWwwAuthenticateHeader(req);
    if (challenge) res.setHeader('WWW-Authenticate', challenge);
    res.status(401).json({ error: 'Unauthorized', message });
}

export async function mcpAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
    const jwtConfig = getMcpJwtAuthConfig();
    const token = extractToken(req);

    if (jwtConfig && token && looksLikeJwtAccessToken(token)) {
        try {
            const oauthUser = await verifyMcpBearerJwt(token, jwtConfig);
            if (oauthUser) {
                req.userId = oauthUser.userId;
                next();
                return;
            }
        } catch (e) {
            console.error('[mcp-auth] OAuth JWT verification failed:', e);
        }
        sendMcpUnauthorized(req, res, 'Invalid or expired access token');
        return;
    }

    const r = await resolveApiKeyCredentials(req);
    if (r.kind === 'anonymous') {
        next();
        return;
    }
    if (r.kind === 'shared_key') {
        req.usedSharedKey = true;
        next();
        return;
    }
    if (r.kind === 'user') {
        req.userId = r.userId;
        next();
        return;
    }
    if (r.kind === 'missing_credentials') {
        sendMcpUnauthorized(req, res, 'Missing API key');
        return;
    }
    sendMcpUnauthorized(req, res, 'Invalid API key');
}
