import type { Request } from 'express';

/**
 * Public URL for this request (used for OAuth protected-resource metadata).
 * Prefer `PUBLIC_BASE_URL` when reverse proxies strip or rewrite Host.
 */
export function publicOriginFromRequest(req: Request): string {
    const fixed = process.env.PUBLIC_BASE_URL?.replace(/\/+$/, '');
    if (fixed) return fixed;

    const proto = (req.get('x-forwarded-proto') || req.protocol || 'https').split(',')[0]!.trim();
    const host = (req.get('x-forwarded-host') || req.get('host') || '').split(',')[0]!.trim();
    if (!host) return '';
    return `${proto}://${host}`;
}

export function mcpResourceUrl(req: Request): string {
    return `${publicOriginFromRequest(req)}/mcp`;
}
