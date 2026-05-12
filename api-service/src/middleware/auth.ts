/**
 * Combined API key / user token auth (optional).
 *
 * Two credential types are accepted in `Authorization: Bearer <token>` or
 * the `x-api-key` header:
 *
 *  1. The shared `API_KEY` env value (legacy "admin" mode). Requests pass
 *     through with no `userId`.
 *  2. A user-generated token (`mme_*`) created in the web app and stored in
 *     Firestore. The middleware resolves the token to a `userId` via the
 *     Firebase Admin SDK and attaches it to the request.
 *
 * When `API_KEY` is unset, requests without a token still pass through
 * (anonymous, no cloud access).
 */

import type { NextFunction, Request, Response } from 'express';
import { verifyApiKey } from '../lib/cloud-store';

declare module 'express-serve-static-core' {
    interface Request {
        /** Set when an authenticated user token was presented. */
        userId?: string;
        /** True when the request matched the legacy shared `API_KEY` env value. */
        usedSharedKey?: boolean;
    }
}

export function extractToken(req: Request): string {
    const headerKey = req.header('x-api-key');
    if (headerKey) return headerKey.trim();
    const auth = req.header('authorization') || '';
    if (auth.toLowerCase().startsWith('bearer ')) return auth.slice(7).trim();
    return '';
}

export type ApiKeyAuthResolution =
    | { kind: 'anonymous' }
    | { kind: 'shared_key' }
    | { kind: 'user'; userId: string }
    | { kind: 'missing_credentials' }
    | { kind: 'invalid_credentials' };

/**
 * Resolve legacy shared `API_KEY` and per-user `mme_*` Firestore tokens.
 * Does not handle OAuth JWTs (see `mcpAuth`).
 */
export async function resolveApiKeyCredentials(req: Request): Promise<ApiKeyAuthResolution> {
    const sharedKey = process.env.API_KEY;
    const token = extractToken(req);

    if (!token) {
        if (sharedKey) return { kind: 'missing_credentials' };
        return { kind: 'anonymous' };
    }

    if (sharedKey && token === sharedKey) {
        return { kind: 'shared_key' };
    }

    try {
        const verified = await verifyApiKey(token);
        if (verified) {
            return { kind: 'user', userId: verified.userId };
        }
    } catch (e) {
        console.error('[auth] verifyApiKey failed:', e);
    }

    return { kind: 'invalid_credentials' };
}

export async function apiKeyAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
    const r = await resolveApiKeyCredentials(req);

    if (r.kind === 'missing_credentials') {
        res.status(401).json({ error: 'Unauthorized', message: 'Missing API key' });
        return;
    }
    if (r.kind === 'invalid_credentials') {
        res.status(401).json({ error: 'Unauthorized', message: 'Invalid API key' });
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
    next();
}

/** Guard endpoints that require a real user (e.g. /v1/me/*). */
export function requireUser(req: Request, res: Response, next: NextFunction): void {
    if (!req.userId) {
        res.status(401).json({
            error: 'Unauthorized',
            message: 'This endpoint requires a user API key (mme_*). Generate one in the editor under Settings → API Service.',
        });
        return;
    }
    next();
}
