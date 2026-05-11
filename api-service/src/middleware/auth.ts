import type { Request, Response, NextFunction } from 'express';

/**
 * Optional shared-secret API-key auth. Enabled by setting the API_KEY env
 * variable. Clients send the key in `Authorization: Bearer <KEY>` or in
 * `x-api-key`.
 */
export function apiKeyAuth(req: Request, res: Response, next: NextFunction): void {
    const expected = process.env.API_KEY;
    if (!expected) {
        next();
        return;
    }

    const headerKey = req.header('x-api-key');
    const auth = req.header('authorization') || '';
    const bearer = auth.toLowerCase().startsWith('bearer ') ? auth.slice(7).trim() : '';
    const provided = headerKey || bearer;

    if (provided && provided === expected) {
        next();
        return;
    }

    res.status(401).json({ error: 'Unauthorized', message: 'Missing or invalid API key' });
}
