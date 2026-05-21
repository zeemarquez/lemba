/**
 * Express application factory — used by the local HTTP server (`index.ts`)
 * and by Vercel’s serverless entry (`api/index.ts`).
 */

import express, { type Request, type Response, type NextFunction } from 'express';
import convertRouter from './routes/convert';
import meRouter from './routes/me';
import { handleTempPdfDownload } from './routes/temp-pdf-download';
import docsRouter from './routes/docs';
import { openApiDocument } from './openapi/spec';
import { apiKeyAuth } from './middleware/auth';
import { mountStreamableMcpHttp } from './mcp/mount-streamable-http';
import oauthRouter from './oauth/router';

const MAX_BODY_MB = Number(process.env.MAX_UPLOAD_SIZE_MB || 25);

export function createApp(): express.Express {
    const app = express();

    app.disable('x-powered-by');
    app.use(express.json({ limit: `${MAX_BODY_MB}mb` }));
    app.use(express.urlencoded({ extended: true, limit: `${MAX_BODY_MB}mb` }));

    app.use((req, _res, next) => {
        console.log(`[${new Date().toISOString()}] ${req.method} ${req.originalUrl}`);
        next();
    });

    app.get('/health', (_req, res) => {
        res.status(200).json({ status: 'ok', service: 'modern-markdown-editor-api', version: '0.1.0' });
    });

    app.get('/openapi.json', (_req, res) => {
        res.status(200).json(openApiDocument);
    });

    if (process.env.DOCS_ENABLED !== 'false') {
        app.use('/docs', docsRouter);
    }

    // OAuth 2.1 endpoints for Claude.ai MCP connector (discovery, register, authorize, token).
    app.use('/', oauthRouter);

    // MCP transport: apply the same optional API-key auth as the REST routes.
    // Anonymous access still works when `API_KEY` is unset; authenticated tools
    // can access the caller's cloud files/fonts.
    mountStreamableMcpHttp(app, '/mcp', { authMiddleware: apiKeyAuth });

    /** Time-limited PDF fetch by token (no API key — token is the secret). */
    app.get('/v1/convert/pdf/:token', handleTempPdfDownload);

    app.use('/v1', apiKeyAuth, convertRouter);
    app.use('/v1/me', apiKeyAuth, meRouter);

    app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
        console.error('[Unhandled error]', err);
        if (res.headersSent) return;
        res.status(500).json({ error: 'InternalError', message: err.message || 'Internal server error' });
    });

    return app;
}

/** Shared singleton so WASM compiler state is consistent across invocations (warm instance). */
let singleton: express.Express | null = null;

export function getApp(): express.Express {
    if (!singleton) singleton = createApp();
    return singleton;
}
