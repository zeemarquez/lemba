import { getFirebaseAdminAuth } from '../lib/firebase-admin';

function getIssuer(): string {
    return (process.env.OAUTH_ISSUER ?? '').replace(/\/$/, '');
}

function requireEnv(name: string): string {
    const v = process.env[name];
    if (!v) throw new Error(`Missing required env var: ${name}`);
    return v;
}

/** Build the Google OAuth authorization URL that the user is redirected to. */
export function buildGoogleAuthUrl(pendingId: string): string {
    const params = new URLSearchParams({
        client_id: requireEnv('GOOGLE_CLIENT_ID'),
        redirect_uri: `${getIssuer()}/oauth/google/callback`,
        response_type: 'code',
        scope: 'openid email profile',
        state: pendingId,
        access_type: 'online',
        prompt: 'select_account',
    });
    return `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
}

interface GoogleTokenPayload {
    sub: string;   // Google user ID
    email: string;
    name?: string;
}

/**
 * Exchange a Google authorization code for the user's Google UID and email.
 * The id_token comes directly from Google so we trust it without re-verifying.
 */
export async function exchangeGoogleCode(code: string): Promise<GoogleTokenPayload> {
    const resp = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
            client_id: requireEnv('GOOGLE_CLIENT_ID'),
            client_secret: requireEnv('GOOGLE_CLIENT_SECRET'),
            code,
            redirect_uri: `${getIssuer()}/oauth/google/callback`,
            grant_type: 'authorization_code',
        }),
    });

    if (!resp.ok) {
        const body = await resp.text();
        throw new Error(`Google token exchange failed: ${resp.status} ${body}`);
    }

    const data = await resp.json() as { id_token?: string };
    if (!data.id_token) throw new Error('Google token response missing id_token');

    // Decode without re-verifying (we just fetched it directly from Google).
    const payloadB64 = data.id_token.split('.')[1];
    if (!payloadB64) throw new Error('Malformed id_token');
    const payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString()) as GoogleTokenPayload;
    if (!payload.sub || !payload.email) throw new Error('id_token missing sub or email');

    return payload;
}

/**
 * Resolve a Google user (identified by their Google UID) to a Firebase UID.
 * Returns null if the user has never signed in to the web app.
 */
export async function getFirebaseUid(googleSub: string): Promise<string | null> {
    const auth = getFirebaseAdminAuth();
    if (!auth) return null;
    try {
        const record = await auth.getUserByProviderUid('google.com', googleSub);
        return record.uid;
    } catch {
        return null;
    }
}
