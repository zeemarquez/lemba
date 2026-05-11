import { Router, type Request, type Response } from 'express';
import multer from 'multer';
import { convertMarkdownToPdf, Template } from '../lib/converter';
import type { FontInput } from '../lib/typst/fonts';

const MAX_UPLOAD_SIZE_MB = Number(process.env.MAX_UPLOAD_SIZE_MB || 25);

const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: MAX_UPLOAD_SIZE_MB * 1024 * 1024 },
});

const router = Router();

interface ConvertJsonBody {
    markdown?: string;
    template?: Template | null;
    title?: string;
    variables?: Record<string, string>;
    fonts?: FontInput[];
    /** Output mode: `binary` (default) returns the PDF as bytes; `base64` wraps in JSON. */
    output?: 'binary' | 'base64';
    /** Include the generated Typst source in the response (debugging). */
    debug?: boolean;
    /** Filename to use in the `Content-Disposition` header. */
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

function sendPdfResponse(res: Response, pdf: Uint8Array, filename: string, typstSource: string | undefined, output: 'binary' | 'base64') {
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

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Length', String(pdf.byteLength));
    if (typstSource) {
        res.setHeader('X-Typst-Source-Length', String(typstSource.length));
    }
    res.status(200).send(Buffer.from(pdf));
}

/**
 * POST /v1/convert (application/json)
 *   {
 *     "markdown":   "# Hello",
 *     "template":   { ...mdt template object... },
 *     "title":      "Optional title",
 *     "variables":  { "author": "Jane" },
 *     "fonts":      [ { "family": "Inter", "url": "https://..." } ],
 *     "output":     "binary" | "base64",
 *     "debug":      false,
 *     "filename":   "report.pdf"
 *   }
 */
router.post('/convert', async (req: Request, res: Response) => {
    try {
        const body = req.body as ConvertJsonBody;
        if (!body || typeof body.markdown !== 'string') {
            res.status(400).json({ error: 'BadRequest', message: '`markdown` (string) is required in JSON body' });
            return;
        }

        const fonts = (body.fonts || []).map((f: FontInput) => ({ family: f.family, url: f.url }));

        const { pdf, typstSource } = await convertMarkdownToPdf(
            {
                markdown: body.markdown,
                template: body.template ?? null,
                title: body.title,
                variables: body.variables,
                fonts,
            },
            { includeSource: !!body.debug },
        );

        const filename = sanitizeFilename(body.filename, body.title || 'document');
        sendPdfResponse(res, pdf, filename, typstSource, body.output || 'binary');
    } catch (e) {
        console.error('[POST /v1/convert] JSON error:', e);
        const message = e instanceof Error ? e.message : String(e);
        res.status(500).json({ error: 'ConversionFailed', message });
    }
});

/**
 * POST /v1/convert/multipart (multipart/form-data)
 *   markdown:     file or text field
 *   template:     file (.mdt JSON) or text field (JSON string)
 *   title:        text
 *   variables:    text (JSON object)
 *   fonts:        text (JSON array of { family, url })
 *   fontFiles:    one or more font files (binary). Filenames become the
 *                 family name unless overridden by a parallel `fonts` entry.
 *   output:       'binary' | 'base64' (default binary)
 *   debug:        '1' | 'true' to return Typst source as well
 *   filename:     output filename
 */
router.post(
    '/convert/multipart',
    upload.fields([
        { name: 'markdown', maxCount: 1 },
        { name: 'template', maxCount: 1 },
        { name: 'fontFiles', maxCount: 20 },
    ]),
    async (req: Request, res: Response) => {
        try {
            const files = (req.files as Record<string, Express.Multer.File[]>) || {};

            // markdown can be a file OR a text field
            let markdown: string | undefined;
            const mdFile = files.markdown?.[0];
            if (mdFile) {
                markdown = mdFile.buffer.toString('utf8');
            } else if (typeof req.body.markdown === 'string') {
                markdown = req.body.markdown;
            }
            if (typeof markdown !== 'string') {
                res.status(400).json({ error: 'BadRequest', message: '`markdown` (file or field) is required' });
                return;
            }

            // template can be a file OR a text field with JSON
            let template: Template | undefined;
            const templateFile = files.template?.[0];
            if (templateFile) {
                try {
                    template = JSON.parse(templateFile.buffer.toString('utf8')) as Template;
                } catch (e) {
                    res.status(400).json({ error: 'BadRequest', message: `template file is not valid JSON: ${(e as Error).message}` });
                    return;
                }
            } else if (req.body.template) {
                template = parseJsonField<Template>(req.body.template, 'template');
            }

            let variables: Record<string, string> | undefined;
            try {
                variables = parseJsonField<Record<string, string>>(req.body.variables, 'variables');
            } catch (e) {
                res.status(400).json({ error: 'BadRequest', message: (e as Error).message });
                return;
            }

            let fontsFromField: FontInput[] = [];
            try {
                fontsFromField = parseJsonField<FontInput[]>(req.body.fonts, 'fonts') || [];
            } catch (e) {
                res.status(400).json({ error: 'BadRequest', message: (e as Error).message });
                return;
            }

            const fontFiles = files.fontFiles || [];
            const fontsFromFiles: FontInput[] = fontFiles.map((f) => ({
                family: (f.originalname || 'CustomFont').replace(/\.[^/.]+$/, ''),
                data: new Uint8Array(f.buffer),
            }));

            const fonts: FontInput[] = [...fontsFromField, ...fontsFromFiles];

            const title = typeof req.body.title === 'string' ? req.body.title : undefined;
            const debug = ['1', 'true', 'yes'].includes(String(req.body.debug || '').toLowerCase());
            const outputRaw = String(req.body.output || 'binary').toLowerCase();
            const output: 'binary' | 'base64' = outputRaw === 'base64' ? 'base64' : 'binary';

            const { pdf, typstSource } = await convertMarkdownToPdf(
                { markdown, template, title, variables, fonts },
                { includeSource: debug },
            );

            const filename = sanitizeFilename(req.body.filename, title || mdFile?.originalname || 'document');
            sendPdfResponse(res, pdf, filename, typstSource, output);
        } catch (e) {
            console.error('[POST /v1/convert/multipart] error:', e);
            const message = e instanceof Error ? e.message : String(e);
            res.status(500).json({ error: 'ConversionFailed', message });
        }
    },
);

export default router;
