import { randomBytes } from 'node:crypto';

export interface TempPdfEntry {
    pdf: Uint8Array;
    filename: string;
    expiresAtMs: number;
}

const store = new Map<string, TempPdfEntry>();

const DEFAULT_TTL_MS = (Number(process.env.PDF_TEMP_URL_TTL_SECONDS) || 900) * 1000;

function purgeExpired(): void {
    const now = Date.now();
    for (const [k, v] of store) {
        if (now > v.expiresAtMs) store.delete(k);
    }
}

/**
 * Persist PDF bytes in memory and return an opaque token for GET /v1/convert/pdf/:token.
 * Entries expire after TTL (see PDF_TEMP_URL_TTL_SECONDS).
 */
export function storeTempPdf(pdf: Uint8Array, filename: string, ttlMs = DEFAULT_TTL_MS): { token: string; expiresAtMs: number } {
    purgeExpired();
    const token = randomBytes(24).toString('hex');
    const expiresAtMs = Date.now() + ttlMs;
    store.set(token, { pdf, filename, expiresAtMs });
    return { token, expiresAtMs };
}

export function getTempPdf(token: string): TempPdfEntry | undefined {
    purgeExpired();
    const entry = store.get(token);
    if (!entry) return undefined;
    if (Date.now() > entry.expiresAtMs) {
        store.delete(token);
        return undefined;
    }
    return entry;
}
