import { Router, type Request, type Response } from 'express';
import multer from 'multer';
import { convertMarkdownToPdf } from '../lib/converter';
import { buildTempPdfAbsoluteUrl } from '../lib/pdf-public-url';
import { storeTempPdf } from '../lib/pdf-temp-store';
import {
    ResolutionError,
    resolveFonts,
    resolveMarkdown,
    resolveTemplate,
    type FontSourceEntry,
    type MarkdownSource,
    type TemplateSource,
} from '../lib/source-resolvers';

const MAX_UPLOAD_SIZE_MB = Number(process.env.MAX_UPLOAD_SIZE_MB || 25);

const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: MAX_UPLOAD_SIZE_MB * 1024 * 1024 },
});

const router = Router();

type PdfOutputMode = 'binary' | 'base64' | 'url';

interface ConvertJsonBody extends MarkdownSource, TemplateSource {
    title?: string;
    variables?: Record<string, string>;
    fonts?: FontSourceEntry[];
    output?: PdfOutputMode;
    debug?: boolean;
    filename?: string;
}

function parseJsonField<T>(value: unknown, field: string): T | undefined {
    if (value === undefined || value === null || value === '') return undefined;
    if (typeof value === 'object') return value as T;
    if (typeof value === 'string') {
        try {
            return JSON.parse(value) as T;
        } catch (e) {
            throw new Error(`Field \`${field}\` must be valid JSON: ${(e as Error).message}`);
        }
    }
    throw new Error(`Field \`${field}\` has unsupported type`);
}

function sanitizeFilename(name: string | undefined, fallback: string): string {
    const base = (name || fallback).replace(/[^A-Za-z0-9._\- ]+/g, '_').trim() || fallback;
    return base.toLowerCase().endsWith('.pdf') ? base : `${base}.pdf`;
}

function sendPdfResponse(
    res: Response,
    req: Request,
    pdf: Uint8Array,
    filename: string,
    typstSource: string | undefined,
    output: PdfOutputMode,
) {
    if (output === 'base64') {
        res.status(200).json({
            filename,
            mimeType: 'application/pdf',
            base64: Buffer.from(pdf).toString('base64'),
            byteLength: pdf.byteLength,
            typstSource,
        });
        return;
    }

    if (output === 'url') {
        const { token, expiresAtMs } = storeTempPdf(pdf, filename);
        const url = buildTempPdfAbsoluteUrl(token, req);
        res.status(200).json({
            filename,
            mimeType: 'application/pdf',
            url,
            expiresAt: new Date(expiresAtMs).toISOString(),
            byteLength: pdf.byteLength,
            typstSource,
        });
        return;
    }

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Length', String(pdf.byteLength));
    if (typstSource) {
        res.setHeader('X-Typst-Source-Length', String(typstSource.length));
    }
    res.status(200).send(Buffer.from(pdf));
}

function sendResolutionError(res: Response, err: unknown) {
    if (err instanceof ResolutionError) {
        res.status(err.status).json({ error: err.status === 401 ? 'Unauthorized' : 'BadRequest', message: err.message });
        return true;
    }
    return false;
}

/**
 * POST /v1/convert (application/json)
 *
 * Body accepts exactly one of `md_raw` / `md_file` / `md_cloud_filepath` for
 * the markdown source, and optionally one of `template_raw` / `template_file`
 * / `template_cloud_filepath` for the template. `*_cloud_filepath` requires an
 * authenticated user API key.
 *
 * Fonts: array of `{ family?, font_raw? | font_file? | url? | font_cloud_filepath? }`.
 */
router.post('/convert', async (req: Request, res: Response) => {
    try {
        const body = (req.body || {}) as ConvertJsonBody;

        const outputRaw = body.output ?? 'binary';
        if (outputRaw !== 'binary' && outputRaw !== 'base64' && outputRaw !== 'url') {
            res.status(400).json({
                error: 'BadRequest',
                message: '`output` must be "binary", "base64", or "url"',
            });
            return;
        }
        const output: PdfOutputMode = outputRaw;

        let markdown: string;
        let template: Awaited<ReturnType<typeof resolveTemplate>>['template'];
        let fonts;
        try {
            ({ markdown } = await resolveMarkdown(body, { userId: req.userId }));
            ({ template } = await resolveTemplate(body, { userId: req.userId }));
            fonts = await resolveFonts(body.fonts, { userId: req.userId });
        } catch (e) {
            if (sendResolutionError(res, e)) return;
            throw e;
        }

        const { pdf, typstSource } = await convertMarkdownToPdf(
            {
                markdown,
                template: template ?? null,
                title: body.title,
                variables: body.variables,
                fonts,
            },
            { includeSource: !!body.debug },
        );

        const filename = sanitizeFilename(body.filename, body.title || 'document');
        sendPdfResponse(res, req, pdf, filename, typstSource, output);
    } catch (e) {
        console.error('[POST /v1/convert] JSON error:', e);
        const message = e instanceof Error ? e.message : String(e);
        res.status(500).json({ error: 'ConversionFailed', message });
    }
});

/**
 * POST /v1/convert/multipart
 *
 * Form fields (use exactly one for markdown and at most one for template):
 *
 *   md_raw, md_file (file part), md_cloud_filepath
 *   template_raw, template_file (file part), template_cloud_filepath
 *   fonts        — JSON array of `{ family?, url?, font_raw?, font_cloud_filepath? }`
 *   font_files   — one or more font file parts (deprecated alias: `fontFiles`)
 *   title, variables (JSON), output, debug, filename
 *
 * Legacy aliases still accepted: `markdown`, `template`, `fontFiles`.
 */
router.post(
    '/convert/multipart',
    upload.fields([
        { name: 'md_file', maxCount: 1 },
        { name: 'markdown', maxCount: 1 },
        { name: 'template_file', maxCount: 1 },
        { name: 'template', maxCount: 1 },
        { name: 'font_files', maxCount: 20 },
        { name: 'fontFiles', maxCount: 20 },
    ]),
    async (req: Request, res: Response) => {
        try {
            const files = (req.files as Record<string, Express.Multer.File[]>) || {};

            const mdFile = files.md_file?.[0] ?? files.markdown?.[0];
            const mdSource: MarkdownSource = {
                md_raw: typeof req.body.md_raw === 'string' ? req.body.md_raw : undefined,
                markdown: typeof req.body.markdown === 'string' ? req.body.markdown : undefined,
                md_cloud_filepath:
                    typeof req.body.md_cloud_filepath === 'string'
                        ? req.body.md_cloud_filepath
                        : undefined,
            };
            if (mdFile) {
                mdSource.md_file = mdFile.buffer.toString('utf8');
            }

            const templateFile = files.template_file?.[0] ?? files.template?.[0];
            const tplSource: TemplateSource = {
                template_raw: typeof req.body.template_raw === 'string' ? req.body.template_raw : undefined,
                template:
                    typeof req.body.template === 'string'
                        ? req.body.template
                        : undefined,
                template_cloud_filepath:
                    typeof req.body.template_cloud_filepath === 'string'
                        ? req.body.template_cloud_filepath
                        : undefined,
            };
            if (templateFile) {
                tplSource.template_file = templateFile.buffer.toString('utf8');
            }

            let markdown: string;
            let template;
            try {
                ({ markdown } = await resolveMarkdown(mdSource, { userId: req.userId }));
                ({ template } = await resolveTemplate(tplSource, { userId: req.userId }));
            } catch (e) {
                if (sendResolutionError(res, e)) return;
                throw e;
            }

            let variables: Record<string, string> | undefined;
            try {
                variables = parseJsonField<Record<string, string>>(req.body.variables, 'variables');
            } catch (e) {
                res.status(400).json({ error: 'BadRequest', message: (e as Error).message });
                return;
            }

            let fontEntries: FontSourceEntry[] = [];
            try {
                fontEntries = parseJsonField<FontSourceEntry[]>(req.body.fonts, 'fonts') || [];
            } catch (e) {
                res.status(400).json({ error: 'BadRequest', message: (e as Error).message });
                return;
            }

            const fontFiles = files.font_files ?? files.fontFiles ?? [];
            for (const file of fontFiles) {
                fontEntries.push({
                    family: (file.originalname || 'CustomFont').replace(/\.[^/.]+$/, ''),
                    font_file: new Uint8Array(file.buffer),
                });
            }

            let resolvedFonts;
            try {
                resolvedFonts = await resolveFonts(fontEntries, { userId: req.userId });
            } catch (e) {
                if (sendResolutionError(res, e)) return;
                throw e;
            }

            const title = typeof req.body.title === 'string' ? req.body.title : undefined;
            const debug = ['1', 'true', 'yes'].includes(String(req.body.debug || '').toLowerCase());
            const outputRaw = String(req.body.output || 'binary').toLowerCase();
            let output: PdfOutputMode = 'binary';
            if (outputRaw === 'base64') output = 'base64';
            else if (outputRaw === 'url') output = 'url';
            else if (outputRaw !== 'binary') {
                res.status(400).json({ error: 'BadRequest', message: '`output` must be binary, base64, or url' });
                return;
            }

            const { pdf, typstSource } = await convertMarkdownToPdf(
                { markdown, template: template ?? null, title, variables, fonts: resolvedFonts },
                { includeSource: debug },
            );

            const filename = sanitizeFilename(
                typeof req.body.filename === 'string' ? req.body.filename : undefined,
                title || mdFile?.originalname || 'document',
            );
            sendPdfResponse(res, req, pdf, filename, typstSource, output);
        } catch (e) {
            console.error('[POST /v1/convert/multipart] error:', e);
            const message = e instanceof Error ? e.message : String(e);
            res.status(500).json({ error: 'ConversionFailed', message });
        }
    },
);

export default router;
