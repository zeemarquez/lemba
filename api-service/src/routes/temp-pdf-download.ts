import type { Request, Response } from 'express';
import { getTempPdf } from '../lib/pdf-temp-store';

/** GET /v1/convert/pdf/:token — no API key; the token is the capability (time-limited). */
export function handleTempPdfDownload(req: Request, res: Response): void {
    const token = typeof req.params.token === 'string' ? req.params.token : '';
    if (!/^[a-f0-9]{48}$/i.test(token)) {
        res.status(400).type('text/plain').send('Invalid token');
        return;
    }
    const entry = getTempPdf(token);
    if (!entry) {
        res.status(404).type('text/plain').send('Not found or expired');
        return;
    }
    const safeName = entry.filename.replace(/[\r\n"]/g, '_');
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${safeName}"`);
    res.setHeader('Content-Length', String(entry.pdf.byteLength));
    res.status(200).send(Buffer.from(entry.pdf));
}
