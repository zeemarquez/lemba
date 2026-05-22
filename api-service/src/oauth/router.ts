import { Router, type Request, type Response } from 'express';
import { createHash, randomBytes } from 'node:crypto';
import {
    clientStore,
    codeStore,
    pendingAuthStore,
    createClient,
    createAuthCode,
    createPendingAuth,
    cleanupExpiredCodes,
} from './store';
import { buildGoogleAuthUrl, exchangeGoogleCode, getFirebaseUid } from './google-auth';
import { storeApiKey } from '../lib/cloud-store';

const router = Router();

function getIssuer(req: Request): string {
    const env = process.env.OAUTH_ISSUER;
    if (env) return env.replace(/\/$/, '');
    return `${req.protocol}://${req.get('host')}`;
}

// ──────────────────────────────────────────────────────────────────────────────
// Discovery
// ──────────────────────────────────────────────────────────────────────────────
router.get('/.well-known/oauth-authorization-server', (req: Request, res: Response) => {
    const issuer = getIssuer(req);
    res.json({
        issuer,
        authorization_endpoint: `${issuer}/oauth/authorize`,
        token_endpoint: `${issuer}/oauth/token`,
        registration_endpoint: `${issuer}/oauth/register`,
        response_types_supported: ['code'],
        grant_types_supported: ['authorization_code'],
        code_challenge_methods_supported: ['S256'],
        token_endpoint_auth_methods_supported: ['none'],
    });
});

// RFC 9728 — Protected Resource Metadata.
// MCP clients use this to discover which authorization server protects the resource.
router.get('/.well-known/oauth-protected-resource', (req: Request, res: Response) => {
    const issuer = getIssuer(req);
    res.json({
        resource: issuer,
        authorization_servers: [issuer],
        bearer_methods_supported: ['header'],
    });
});

// ──────────────────────────────────────────────────────────────────────────────
// Dynamic Client Registration (RFC 7591)
// ──────────────────────────────────────────────────────────────────────────────
router.post('/oauth/register', (req: Request, res: Response) => {
    const { client_name, redirect_uris } = req.body ?? {};

    if (!Array.isArray(redirect_uris) || redirect_uris.length === 0) {
        res.status(400).json({ error: 'invalid_client_metadata', error_description: 'redirect_uris is required' });
        return;
    }
    if (redirect_uris.some((u: unknown) => typeof u !== 'string')) {
        res.status(400).json({ error: 'invalid_client_metadata', error_description: 'redirect_uris must be strings' });
        return;
    }

    const name = typeof client_name === 'string' && client_name ? client_name : 'Unknown client';
    const client = createClient(name, redirect_uris as string[]);

    res.status(201).json({
        client_id: client.client_id,
        client_name: client.client_name,
        redirect_uris: client.redirect_uris,
        grant_types: ['authorization_code'],
        response_types: ['code'],
        token_endpoint_auth_method: 'none',
    });
});

// ──────────────────────────────────────────────────────────────────────────────
// Authorization endpoint — validate MCP params, then redirect to Google sign-in
// ──────────────────────────────────────────────────────────────────────────────
router.get('/oauth/authorize', (req: Request, res: Response) => {
    const { client_id, redirect_uri, state, code_challenge, code_challenge_method, response_type } =
        req.query as Record<string, string>;

    if (response_type !== 'code') {
        res.status(400).json({ error: 'unsupported_response_type' });
        return;
    }
    if (!client_id || !clientStore.has(client_id)) {
        res.status(400).json({ error: 'invalid_client', error_description: 'Unknown client_id' });
        return;
    }
    const client = clientStore.get(client_id)!;
    if (!redirect_uri || !client.redirect_uris.includes(redirect_uri)) {
        res.status(400).json({ error: 'invalid_request', error_description: 'redirect_uri not registered' });
        return;
    }
    if (code_challenge_method !== 'S256' || !code_challenge) {
        res.status(400).json({ error: 'invalid_request', error_description: 'code_challenge with S256 is required' });
        return;
    }
    if (!state) {
        res.status(400).json({ error: 'invalid_request', error_description: 'state is required' });
        return;
    }

    // Store MCP OAuth params and redirect user to Google sign-in.
    const pendingId = createPendingAuth(client_id, redirect_uri, state, code_challenge);
    res.redirect(buildGoogleAuthUrl(pendingId));
});

// ──────────────────────────────────────────────────────────────────────────────
// Google OAuth callback — complete sign-in, issue MCP auth code
// ──────────────────────────────────────────────────────────────────────────────
router.get('/oauth/google/callback', async (req: Request, res: Response) => {
    const { code, state: pendingId, error: googleError } = req.query as Record<string, string>;

    if (googleError) {
        res.status(400).send(`Google sign-in failed: ${googleError}`);
        return;
    }

    const pending = pendingId ? pendingAuthStore.get(pendingId) : undefined;
    if (!pending || pending.expiresAt < Date.now()) {
        res.status(400).send('Authorization session expired or invalid. Please try again.');
        return;
    }
    pendingAuthStore.delete(pendingId);

    if (!code) {
        res.status(400).send('Missing authorization code from Google.');
        return;
    }

    let googleUid: string;
    try {
        const payload = await exchangeGoogleCode(code);
        googleUid = payload.sub;
    } catch (err) {
        console.error('[OAuth] Google code exchange failed:', err);
        res.status(502).send('Failed to complete Google sign-in. Please try again.');
        return;
    }

    const firebaseUid = await getFirebaseUid(googleUid);
    if (!firebaseUid) {
        res.status(403).send(
            'Your Google account is not linked to a Lemba account. ' +
            'Please sign in to the web app first.',
        );
        return;
    }

    const authCode = randomBytes(32).toString('base64url');
    createAuthCode(pending.client_id, pending.redirect_uri, firebaseUid, pending.code_challenge, authCode);

    const callback = new URL(pending.redirect_uri);
    callback.searchParams.set('code', authCode);
    callback.searchParams.set('state', pending.state);
    res.redirect(callback.toString());
});

// ──────────────────────────────────────────────────────────────────────────────
// Token endpoint
// ──────────────────────────────────────────────────────────────────────────────
router.post('/oauth/token', async (req: Request, res: Response) => {
    const { grant_type, code, redirect_uri, client_id, code_verifier } = req.body ?? {};

    if (grant_type !== 'authorization_code') {
        res.status(400).json({ error: 'unsupported_grant_type' });
        return;
    }

    cleanupExpiredCodes();

    const entry = typeof code === 'string' ? codeStore.get(code) : undefined;
    if (!entry || entry.expiresAt < Date.now()) {
        res.status(400).json({ error: 'invalid_grant', error_description: 'Authorization code is invalid or expired' });
        return;
    }
    if (entry.client_id !== client_id) {
        res.status(400).json({ error: 'invalid_grant', error_description: 'client_id mismatch' });
        return;
    }
    if (entry.redirect_uri !== redirect_uri) {
        res.status(400).json({ error: 'invalid_grant', error_description: 'redirect_uri mismatch' });
        return;
    }

    if (typeof code_verifier !== 'string' || !code_verifier) {
        res.status(400).json({ error: 'invalid_request', error_description: 'code_verifier is required' });
        return;
    }
    const expectedChallenge = createHash('sha256').update(code_verifier).digest('base64url');
    if (expectedChallenge !== entry.code_challenge) {
        res.status(400).json({ error: 'invalid_grant', error_description: 'PKCE verification failed' });
        return;
    }

    codeStore.delete(code);

    const accessToken = 'mme_' + randomBytes(32).toString('hex');
    const tokenName = `Claude (OAuth) — ${new Date().toLocaleDateString('en-US')}`;

    try {
        await storeApiKey(accessToken, entry.userId, tokenName);
    } catch (err) {
        console.error('[OAuth] storeApiKey failed:', err);
        res.status(500).json({ error: 'server_error', error_description: 'Failed to issue access token' });
        return;
    }

    res.json({ access_token: accessToken, token_type: 'Bearer', scope: '' });
});

export default router;
