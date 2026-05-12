/**
 * `/v1/me/*` endpoints — read-only access to the authenticated user's
 * cloud-saved files, templates, and fonts.
 *
 * Each endpoint returns a JSON list of small descriptors (no binary payloads).
 */

import { Router, type Request, type Response } from 'express';
import { requireUser } from '../middleware/auth';
import {
    listUserFonts,
    listUserMarkdownFiles,
    listUserTemplates,
} from '../lib/cloud-store';

const router = Router();

router.use(requireUser);

function isoFromMs(ms: number): string | undefined {
    if (!ms) return undefined;
    try {
        return new Date(ms).toISOString();
    } catch {
        return undefined;
    }
}

/**
 * GET /v1/me/files — all non-template markdown files in the user's cloud.
 */
router.get('/files', async (req: Request, res: Response) => {
    try {
        const files = await listUserMarkdownFiles(req.userId!);
        res.status(200).json({
            files: files.map((f) => ({
                filename: f.path.split('/').pop() || f.path,
                filepath: f.path,
                lastChanged: f.updatedAt,
                lastChangedIso: isoFromMs(f.updatedAt),
                byteLength: f.content.length,
            })),
        });
    } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        res.status(500).json({ error: 'CloudReadFailed', message });
    }
});

/**
 * GET /v1/me/templates — all `.mdt` / `.json` files under `Templates/`.
 */
router.get('/templates', async (req: Request, res: Response) => {
    try {
        const templates = await listUserTemplates(req.userId!);
        res.status(200).json({
            templates: templates.map((f) => {
                const filename = f.path.split('/').pop() || f.path;
                let name = filename.replace(/\.(mdt|json)$/i, '');
                try {
                    const parsed = JSON.parse(f.content) as { name?: string };
                    if (parsed && typeof parsed.name === 'string' && parsed.name) name = parsed.name;
                } catch {
                    /* ignore */
                }
                return {
                    filename,
                    name,
                    filepath: f.path,
                    lastChanged: f.updatedAt,
                    lastChangedIso: isoFromMs(f.updatedAt),
                };
            }),
        });
    } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        res.status(500).json({ error: 'CloudReadFailed', message });
    }
});

/**
 * GET /v1/me/fonts — all custom fonts in the user's cloud.
 */
router.get('/fonts', async (req: Request, res: Response) => {
    try {
        const fonts = await listUserFonts(req.userId!, false);
        res.status(200).json({
            fonts: fonts.map((f) => ({
                id: f.id,
                family: f.family,
                fileName: f.fileName,
                filepath: f.id,
                format: f.format,
                lastChanged: f.updatedAt,
                lastChangedIso: isoFromMs(f.updatedAt),
            })),
        });
    } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        res.status(500).json({ error: 'CloudReadFailed', message });
    }
});

export default router;
