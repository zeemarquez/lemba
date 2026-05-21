import { randomUUID } from 'node:crypto';

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

export const clientStore = new Map<string, OAuthClient>();
export const codeStore = new Map<string, AuthCode>();

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
