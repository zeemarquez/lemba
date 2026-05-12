/**
 * `/v1/me/*` endpoints — access to the authenticated user's cloud-saved
 * files, templates, and fonts (Firestore mirror of the web app sync layer).
 */

import { Router, type Request, type Response } from 'express';
import { requireUser } from '../middleware/auth';
import { isFirebaseAdminConfigured } from '../lib/firebase-admin';
import {
    createUserMarkdownFile,
    getUserMarkdownFileByPath,
    listUserFonts,
    listUserMarkdownFiles,
    listUserTemplates,
    normalizeCloudFilepath,
    replaceUserMarkdownFileByPath,
} from '../lib/cloud-store';
import { buildWebappFileDeepLink } from '../lib/webapp-file-link';

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

function firebaseUnavailable(res: Response): void {
    res.status(503).json({
        error: 'ServiceUnavailable',
        message: 'Cloud storage is not configured on this API deployment (Firebase Admin SDK).',
    });
}

function statusForCloudWrite(err: unknown): number {
    const message = err instanceof Error ? err.message : String(err);
    if (message.includes('Firebase Admin SDK is not configured')) return 503;
    if (message.includes('No file at path')) return 404;
    if (
        message.includes('Invalid path') ||
        message.includes('Path is empty') ||
        message.includes('Invalid folder path') ||
        message.includes('Filename must') ||
        message.includes('cannot create folder') ||
        message.includes('is a folder') ||
        message.includes('must end with')
    ) {
        return 400;
    }
    return 500;
}

/**
 * GET /v1/me/files/content?filepath= — full UTF-8 body of a cloud file (markdown).
 */
router.get('/files/content', async (req: Request, res: Response) => {
    if (!isFirebaseAdminConfigured()) {
        firebaseUnavailable(res);
        return;
    }
    const filepathRaw =
        typeof req.query.filepath === 'string'
            ? req.query.filepath.trim()
            : '';
    if (!filepathRaw) {
        res.status(400).json({ error: 'BadRequest', message: 'Query parameter `filepath` is required.' });
        return;
    }
    let filepath: string;
    try {
        filepath = normalizeCloudFilepath(filepathRaw);
    } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        res.status(400).json({ error: 'BadRequest', message });
        return;
    }
    try {
        const file = await getUserMarkdownFileByPath(req.userId!, filepath);
        if (!file) {
            res.status(404).json({ error: 'NotFound', message: `No file at path "${filepath}".` });
            return;
        }
        if (file.type === 'folder') {
            res.status(400).json({ error: 'BadRequest', message: `Path "${filepath}" is a folder, not a file.` });
            return;
        }
        res.status(200).json({
            filepath: file.path,
            fileId: file.syncId,
            content: file.content,
            lastChanged: file.updatedAt,
            lastChangedIso: isoFromMs(file.updatedAt),
            byteLength: file.content.length,
        });
    } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        res.status(500).json({ error: 'CloudReadFailed', message });
    }
});

/**
 * POST /v1/me/files/upload — create a new markdown file only (fails if path already exists). Creates `folderPath` when missing.
 *
 * Body: `{ "content": string, "filename": string, "folderPath": string }` (`folderPath` may be `""` for vault root under `Files/`).
 */
router.post('/files/upload', async (req: Request, res: Response) => {
    if (!isFirebaseAdminConfigured()) {
        firebaseUnavailable(res);
        return;
    }
    const body = req.body as Record<string, unknown>;
    const content = typeof body.content === 'string' ? body.content : null;
    const filename = typeof body.filename === 'string' ? body.filename : null;
    const folderPath = typeof body.folderPath === 'string' ? body.folderPath : '';
    if (content === null) {
        res.status(400).json({ error: 'BadRequest', message: 'Body field `content` (string) is required.' });
        return;
    }
    if (filename === null || !filename.trim()) {
        res.status(400).json({ error: 'BadRequest', message: 'Body field `filename` (non-empty string) is required.' });
        return;
    }
    try {
        const result = await createUserMarkdownFile(req.userId!, {
            folderPath,
            filename,
            content,
        });
        res.status(201).json({
            filepath: result.path,
            fileId: result.syncId,
            created: true,
            webUrl: buildWebappFileDeepLink(result.syncId),
        });
    } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        if (message.includes('File already exists')) {
            res.status(409).json({ error: 'Conflict', message });
            return;
        }
        const status = statusForCloudWrite(e);
        res.status(status).json({
            error:
                status === 503
                    ? 'ServiceUnavailable'
                    : status === 400
                      ? 'BadRequest'
                      : 'CloudWriteFailed',
            message,
        });
    }
});

/**
 * POST /v1/me/files/replace — overwrite markdown body of an existing file at `filepath`.
 *
 * Body: `{ "filepath": string, "content": string }`
 */
router.post('/files/replace', async (req: Request, res: Response) => {
    if (!isFirebaseAdminConfigured()) {
        firebaseUnavailable(res);
        return;
    }
    const body = req.body as Record<string, unknown>;
    const content = typeof body.content === 'string' ? body.content : null;
    const filepathRaw = typeof body.filepath === 'string' ? body.filepath.trim() : '';
    if (content === null) {
        res.status(400).json({ error: 'BadRequest', message: 'Body field `content` (string) is required.' });
        return;
    }
    if (!filepathRaw) {
        res.status(400).json({ error: 'BadRequest', message: 'Body field `filepath` (non-empty string) is required.' });
        return;
    }
    let filepath: string;
    try {
        filepath = normalizeCloudFilepath(filepathRaw);
    } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        res.status(400).json({ error: 'BadRequest', message });
        return;
    }
    try {
        const result = await replaceUserMarkdownFileByPath(req.userId!, filepath, content);
        res.status(200).json({
            filepath: result.path,
            fileId: result.syncId,
            webUrl: buildWebappFileDeepLink(result.syncId),
        });
    } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        const status = statusForCloudWrite(e);
        const errLabel =
            status === 503 ? 'ServiceUnavailable' : status === 400 ? 'BadRequest' : status === 404 ? 'NotFound' : 'CloudWriteFailed';
        res.status(status).json({ error: errLabel, message });
    }
});

/**
 * GET /v1/me/files — all non-template markdown files in the user's cloud.
 */
router.get('/files', async (req: Request, res: Response) => {
    try {
        const files = await listUserMarkdownFiles(req.userId!);
        res.status(200).json({
            files: files.map((f) => ({
                fileId: f.syncId,
                filename: f.path.split('/').pop() || f.path,
                filepath: f.path,
                type: f.type,
                isDeleted: f.isDeleted,
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
                    fileId: f.syncId,
                    filename,
                    name,
                    filepath: f.path,
                    type: f.type,
                    isDeleted: f.isDeleted,
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
