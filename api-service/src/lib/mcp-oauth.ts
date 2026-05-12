/**
 * MCP OAuth 2.0 Protected Resource Metadata (RFC 9728) + JWT access-token
 * verification for Streamable HTTP `/mcp`, alongside legacy API keys.
 */

import type { Request, Response } from 'express';
import { createRemoteJWKSet, jwtVerify, type JWTPayload } from 'jose';

export function getPublicOrigin(req: Request): string {
    const fromEnv = process.env.PUBLIC_BASE_URL?.trim();
    if (fromEnv) return fromEnv.replace(/\/+$/, '');
    const xfProto = (req.headers['x-forwarded-proto'] as string | undefined)?.split(',')[0]?.trim();
    const proto = xfProto || req.protocol;
    const host =
        (req.headers['x-forwarded-host'] as string | undefined)?.split(',')[0]?.trim() || req.get('host') || 'localhost';
    return `${proto}://${host}`;
}

export function getMcpResourceUrl(req: Request, mcpPath = '/mcp'): string {
    return `${getPublicOrigin(req)}${mcpPath.startsWith('/') ? mcpPath : `/${mcpPath}`}`;
}

export function isMcpOAuthMetadataEnabled(): boolean {
    return Boolean(process.env.MCP_OAUTH_ISSUER_URL?.trim());
}

export function getMcpProtectedResourceMetadataUrl(req: Request): string | null {
    if (!isMcpOAuthMetadataEnabled()) return null;
    return `${getPublicOrigin(req)}/.well-known/oauth-protected-resource/mcp`;
}

export interface McpJwtAuthConfig {
    /** Issuer base URLs as configured (used for OIDC discovery and `authorization_servers`). */
    issuerInputs: string[];
    audience: string;
    userIdClaim: string;
}

export function getMcpJwtAuthConfig(): McpJwtAuthConfig | null {
    const issuerRaw = process.env.MCP_OAUTH_ISSUER_URL?.trim();
    const audience = process.env.MCP_OAUTH_AUDIENCE?.trim();
    if (!issuerRaw || !audience) return null;
    const issuerInputs = issuerRaw
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
    if (!issuerInputs.length) return null;
    const userIdClaim = (process.env.MCP_OAUTH_USER_ID_CLAIM || 'sub').trim() || 'sub';
    return { issuerInputs, audience, userIdClaim };
}

function parseScopesSupported(): string[] {
    const raw = process.env.MCP_OAUTH_SCOPES?.trim();
    if (!raw) return ['openid', 'profile', 'email'];
    return raw
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
}

export function getMcpOauthScopesForChallenge(): string {
    return parseScopesSupported().join(' ');
}

const oidcDocumentCache = new Map<string, { jwks_uri: string; issuer: string }>();
const jwksByUri = new Map<string, ReturnType<typeof createRemoteJWKSet>>();

function issuerBaseForDiscovery(issuerInput: string): string {
    return issuerInput.endsWith('/') ? issuerInput : `${issuerInput}/`;
}

async function discoverOidc(issuerInput: string): Promise<{ jwks_uri: string; issuer: string }> {
    const base = issuerBaseForDiscovery(issuerInput);
    const cached = oidcDocumentCache.get(base);
    if (cached) return cached;
    const discoUrl = new URL('.well-known/openid-configuration', base).toString();
    const res = await fetch(discoUrl);
    if (!res.ok) {
        throw new Error(`openid-configuration HTTP ${res.status} for ${discoUrl}`);
    }
    const doc = (await res.json()) as { jwks_uri?: string; issuer?: string };
    if (typeof doc.jwks_uri !== 'string' || typeof doc.issuer !== 'string') {
        throw new Error('openid-configuration missing jwks_uri or issuer');
    }
    const meta = { jwks_uri: doc.jwks_uri, issuer: doc.issuer };
    oidcDocumentCache.set(base, meta);
    return meta;
}

function getJwks(jwksUri: string): ReturnType<typeof createRemoteJWKSet> {
    let jwks = jwksByUri.get(jwksUri);
    if (!jwks) {
        jwks = createRemoteJWKSet(new URL(jwksUri));
        jwksByUri.set(jwksUri, jwks);
    }
    return jwks;
}

function getClaim(payload: JWTPayload, path: string): string | undefined {
    const parts = path.split('.');
    let cur: unknown = payload;
    for (const p of parts) {
        if (cur === null || cur === undefined || typeof cur !== 'object') return undefined;
        cur = (cur as Record<string, unknown>)[p];
    }
    if (typeof cur === 'string') return cur;
    if (typeof cur === 'number' && Number.isFinite(cur)) return String(cur);
    return undefined;
}

export function looksLikeJwtAccessToken(token: string): boolean {
    return token.startsWith('eyJ') && token.split('.').length >= 3;
}

export async function verifyMcpBearerJwt(
    token: string,
    config: McpJwtAuthConfig,
): Promise<{ userId: string } | null> {
    for (const issuerInput of config.issuerInputs) {
        let meta: { jwks_uri: string; issuer: string };
        try {
            meta = await discoverOidc(issuerInput);
        } catch {
            continue;
        }
        try {
            const JWKS = getJwks(meta.jwks_uri);
            const { payload } = await jwtVerify(token, JWKS, {
                issuer: meta.issuer,
                audience: config.audience,
                clockTolerance: '60s',
            });
            const userId = getClaim(payload, config.userIdClaim);
            if (userId) return { userId };
        } catch {
            /* try next issuer */
        }
    }
    return null;
}

export interface McpProtectedResourceMetadata {
    resource: string;
    authorization_servers: string[];
    scopes_supported?: string[];
    bearer_methods_supported?: string[];
}

export function buildMcpProtectedResourceMetadata(req: Request, mcpPath = '/mcp'): McpProtectedResourceMetadata {
    const issuerRaw = process.env.MCP_OAUTH_ISSUER_URL!.trim();
    const authorization_servers = issuerRaw
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
    return {
        resource: getMcpResourceUrl(req, mcpPath),
        authorization_servers,
        scopes_supported: parseScopesSupported(),
        bearer_methods_supported: ['header'],
    };
}

export function sendMcpProtectedResourceMetadata(req: Request, res: Response, mcpPath = '/mcp'): void {
    res.status(200).type('application/json').json(buildMcpProtectedResourceMetadata(req, mcpPath));
}

function escapeChallengeValue(value: string): string {
    return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

export function buildMcpWwwAuthenticateHeader(req: Request): string | null {
    const metaUrl = getMcpProtectedResourceMetadataUrl(req);
    if (!metaUrl) return null;
    const scope = getMcpOauthScopesForChallenge();
    return `Bearer resource_metadata="${escapeChallengeValue(metaUrl)}", scope="${escapeChallengeValue(scope)}"`;
}
