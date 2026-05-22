import { randomBytes, randomUUID } from 'node:crypto';

export interface OAuthClient {
    client_id: string;
    client_name: string;
    redirect_uris: string[];
    createdAt: number;
}

export interface AuthCode {
    code: string;
    client_id: string;
    redirect_uri: string;
    userId: string;
    code_challenge: string;
    expiresAt: number;
}

/** Carries MCP OAuth params across the Google sign-in redirect (10-min TTL). */
export interface PendingAuth {
    client_id: string;
    redirect_uri: string;
    state: string;
    code_challenge: string;
    expiresAt: number;
}

export const clientStore = new Map<string, OAuthClient>();
export const codeStore = new Map<string, AuthCode>();
export const pendingAuthStore = new Map<string, PendingAuth>();

export function createPendingAuth(
    client_id: string,
    redirect_uri: string,
    state: string,
    code_challenge: string,
): string {
    const id = randomBytes(16).toString('hex');
    pendingAuthStore.set(id, { client_id, redirect_uri, state, code_challenge, expiresAt: Date.now() + 10 * 60 * 1000 });
    return id;
}

export function createClient(client_name: string, redirect_uris: string[]): OAuthClient {
    const client: OAuthClient = {
        client_id: randomUUID(),
        client_name,
        redirect_uris,
        createdAt: Date.now(),
    };
    clientStore.set(client.client_id, client);
    return client;
}

export function createAuthCode(
    client_id: string,
    redirect_uri: string,
    userId: string,
    code_challenge: string,
    code: string,
): AuthCode {
    const entry: AuthCode = {
        code,
        client_id,
        redirect_uri,
        userId,
        code_challenge,
        expiresAt: Date.now() + 5 * 60 * 1000,
    };
    codeStore.set(code, entry);
    return entry;
}

export function cleanupExpiredCodes(): void {
    const now = Date.now();
    for (const [k, v] of codeStore) {
        if (v.expiresAt < now) codeStore.delete(k);
    }
}

setInterval(cleanupExpiredCodes, 60_000).unref();
