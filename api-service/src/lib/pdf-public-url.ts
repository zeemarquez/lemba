import type { Request } from 'express';

/**
 * Base URL for links returned in JSON (`output: "url"`). Prefer PUBLIC_BASE_URL in production
 * (and for MCP) so clients receive absolute URLs. Falls back to Host / X-Forwarded-* from the
 * request, then http://127.0.0.1:$PORT for local use without env.
 */
export function resolvePublicBaseUrl(req?: Request): string {
    const env = process.env.PUBLIC_BASE_URL?.replace(/\/$/, '');
    if (env) return env;
    if (req) {
        const proto = (req.get('x-forwarded-proto') || req.protocol || 'http').split(',')[0].trim();
        const host = (req.get('x-forwarded-host') || req.get('host') || '').split(',')[0].trim();
        if (host) return `${proto}://${host}`;
    }
    return `http://127.0.0.1:${process.env.PORT || 4000}`;
}

export function buildTempPdfAbsoluteUrl(token: string, req?: Request): string {
    return `${resolvePublicBaseUrl(req)}/v1/convert/pdf/${token}`;
}
