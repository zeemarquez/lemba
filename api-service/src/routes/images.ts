/**
 * `/v1/me/images/*` — Cloudflare R2 image storage for authenticated users.
 *
 * Endpoints:
 *   POST   /v1/me/images/upload       Upload an image (multipart/form-data, field "image")
 *   GET    /v1/me/images              List the user's stored images
 *   DELETE /v1/me/images/:imageId     Delete an image by imageId (with optional ext query param)
 */

import path from 'node:path';
import { Router, type Request, type Response } from 'express';
import multer from 'multer';
import { requireUser } from '../middleware/auth';
import {
    isR2Configured,
    uploadImageToR2,
    deleteImageFromR2,
    listUserImagesFromR2,
    buildImageKey,
} from '../lib/r2-storage';

const MAX_IMAGE_SIZE_MB = 10;

const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: MAX_IMAGE_SIZE_MB * 1024 * 1024 },
    fileFilter: (_req, file, cb) => {
        if (!file.mimetype.startsWith('image/')) {
            cb(new Error('Only image files are accepted.'));
            return;
        }
        cb(null, true);
    },
});

const router = Router();
router.use(requireUser);

function r2Unavailable(res: Response): void {
    res.status(503).json({
        error: 'ServiceUnavailable',
        message:
            'Cloud image storage is not configured on this API deployment. ' +
            'Set CLOUDFLARE_R2_* environment variables to enable.',
    });
}

function generateImageId(): string {
    return `img-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

/**
 * POST /v1/me/images/upload
 * Body: multipart/form-data with field "image" (single file, max 10 MB).
 * Returns: { imageId, url, filename, size, contentType }
 */
router.post('/upload', upload.single('image'), async (req: Request, res: Response) => {
    if (!isR2Configured()) {
        r2Unavailable(res);
        return;
    }

    const file = req.file;
    if (!file) {
        res.status(400).json({ error: 'BadRequest', message: 'Field "image" (image file) is required.' });
        return;
    }

    const ext = path.extname(file.originalname).replace(/^\./, '') || 'bin';
    const imageId = generateImageId();

    try {
        const result = await uploadImageToR2(
            req.userId!,
            imageId,
            ext,
            file.buffer,
            file.mimetype,
        );

        res.status(201).json({
            imageId,
            url: result.url,
            key: result.key,
            filename: file.originalname,
            size: file.size,
            contentType: file.mimetype,
        });
    } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        console.error('[images] upload failed:', message);
        res.status(500).json({ error: 'UploadFailed', message });
    }
});

/**
 * GET /v1/me/images
 * Returns: { images: CloudImageEntry[] }
 */
router.get('/', async (req: Request, res: Response) => {
    if (!isR2Configured()) {
        r2Unavailable(res);
        return;
    }

    try {
        const images = await listUserImagesFromR2(req.userId!);
        res.status(200).json({ images });
    } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        console.error('[images] list failed:', message);
        res.status(500).json({ error: 'ListFailed', message });
    }
});

/**
 * DELETE /v1/me/images/:imageId
 * Query param `ext` is required (e.g. ?ext=jpg).
 */
router.delete('/:imageId', async (req: Request, res: Response) => {
    if (!isR2Configured()) {
        r2Unavailable(res);
        return;
    }

    const { imageId } = req.params;
    const ext = typeof req.query.ext === 'string' ? req.query.ext.trim() : '';

    if (!imageId?.trim()) {
        res.status(400).json({ error: 'BadRequest', message: 'imageId path parameter is required.' });
        return;
    }
    if (!ext) {
        res.status(400).json({ error: 'BadRequest', message: 'Query parameter `ext` (file extension) is required.' });
        return;
    }

    const key = buildImageKey(req.userId!, imageId, ext);

    try {
        await deleteImageFromR2(key);
        res.status(200).json({ deleted: true, key });
    } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        console.error('[images] delete failed:', message);
        res.status(500).json({ error: 'DeleteFailed', message });
    }
});

export default router;
