import type { Express, Request, Response } from 'express';
import { mcpResourceUrl } from './public-url';

/**
 * RFC 9728 OAuth 2.0 Protected Resource Metadata for the MCP endpoint.
 * Remote clients (e.g. Perplexity) use this to discover the authorization server
 * and OAuth registration; without it they cannot complete MCP OAuth.
 *
 * Requires `MCP_OAUTH_ISSUER_URL` (HTTPS issuer of your IdP, e.g. Auth0 tenant URL).
 */
export function attachMcpOAuthProtectedResourceMetadata(app: Express): void {
    const issuerRaw = process.env.MCP_OAUTH_ISSUER_URL?.trim();
    if (!issuerRaw) return;

    const issuer = issuerRaw.endsWith('/') ? issuerRaw : `${issuerRaw}/`;

    app.get('/.well-known/oauth-protected-resource/mcp', (req: Request, res: Response) => {
        const resource = mcpResourceUrl(req);
        if (!resource || !resource.startsWith('https://')) {
            res.status(503).json({
                error: 'Misconfigured',
                message:
                    'Cannot build https resource URL for MCP OAuth metadata. Set PUBLIC_BASE_URL (e.g. https://your-service.onrender.com) on the server.',
            });
            return;
        }

        res.status(200).json({
            resource,
            authorization_servers: [issuer],
            bearer_methods_supported: ['header'],
            scopes_supported: (process.env.MCP_OAUTH_SCOPES || 'openid,profile,email')
                .split(',')
                .map((s) => s.trim())
                .filter(Boolean),
        });
    });
}
