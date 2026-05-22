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
import { getFirebaseAdminAuth } from '../lib/firebase-admin';

declare module 'express-serve-static-core' {
    interface Request {
        /** Set when an authenticated user token was presented. */
        userId?: string;
        /** True when the request matched the legacy shared `API_KEY` env value. */
        usedSharedKey?: boolean;
    }
}

function extractToken(req: Request): string {
    const headerKey = req.header('x-api-key');
    if (headerKey) return headerKey.trim();
    const auth = req.header('authorization') || '';
    if (auth.toLowerCase().startsWith('bearer ')) return auth.slice(7).trim();
    return '';
}

/**
 * Verify a Firebase ID token and return the userId, or null if invalid.
 * Used as a fallback when the token is not an mme_* API key.
 */
async function verifyFirebaseIdToken(token: string): Promise<string | null> {
    if (!token || token.startsWith('mme_')) return null;
    const auth = getFirebaseAdminAuth();
    if (!auth) return null;
    try {
        const decoded = await auth.verifyIdToken(token);
        return decoded.uid;
    } catch {
        return null;
    }
}

export async function apiKeyAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
    const sharedKey = process.env.API_KEY;
    const token = extractToken(req);

    if (!token) {
        if (sharedKey) {
            res.status(401).json({ error: 'Unauthorized', message: 'Missing API key' });
            return;
        }
        next();
        return;
    }

    if (sharedKey && token === sharedKey) {
        req.usedSharedKey = true;
        next();
        return;
    }

    try {
        const verified = await verifyApiKey(token);
        if (verified) {
            req.userId = verified.userId;
            next();
            return;
        }
    } catch (e) {
        console.error('[auth] verifyApiKey failed:', e);
    }

    // Fall back to Firebase ID token (used by the web app frontend for image uploads).
    const firebaseUserId = await verifyFirebaseIdToken(token);
    if (firebaseUserId) {
        req.userId = firebaseUserId;
        next();
        return;
    }

    res.status(401).json({ error: 'Unauthorized', message: 'Invalid API key' });
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

/**
 * Strict auth for the MCP endpoint. Always requires a valid user token and
 * returns a 401 with a WWW-Authenticate Bearer challenge when missing or
 * invalid. This causes MCP clients (Claude Code, claude.ai) to automatically
 * trigger the OAuth flow via /.well-known/oauth-protected-resource.
 */
export async function mcpAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
    const token = extractToken(req);
    if (!token) {
        const resourceUrl = `${req.protocol}://${req.get('host')}`;
        res.setHeader(
            'WWW-Authenticate',
            `Bearer realm="Modern Markdown Editor", resource_metadata="${resourceUrl}/.well-known/oauth-protected-resource"`,
        );
        res.status(401).json({ error: 'Unauthorized', message: 'Authentication required' });
        return;
    }

    // Accept the legacy shared key too (e.g. for server-to-server integrations).
    const sharedKey = process.env.API_KEY;
    if (sharedKey && token === sharedKey) {
        req.usedSharedKey = true;
        next();
        return;
    }

    try {
        const verified = await verifyApiKey(token);
        if (verified) {
            req.userId = verified.userId;
            next();
            return;
        }
    } catch (e) {
        console.error('[auth] verifyApiKey failed:', e);
    }

    const firebaseUserId = await verifyFirebaseIdToken(token);
    if (firebaseUserId) {
        req.userId = firebaseUserId;
        next();
        return;
    }

    res.status(401).json({ error: 'Unauthorized', message: 'Invalid API key' });
}
