/**
 * Express application factory — used by the local HTTP server (`index.ts`)
 * and by Vercel’s serverless entry (`api/index.ts`).
 */

import express, { type Request, type Response, type NextFunction } from 'express';
import convertRouter from './routes/convert';
import { apiKeyAuth } from './middleware/auth';

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

    app.use('/v1', apiKeyAuth, convertRouter);

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
