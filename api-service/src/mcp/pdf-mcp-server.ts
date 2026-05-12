/**
 * MCP server exposing the PDF conversion pipeline plus cloud listing tools.
 *
 * Tools:
 *   - convert_markdown_to_pdf : same as POST /v1/convert
 *   - list_cloud_files        : same as GET  /v1/me/files
 *   - list_cloud_templates    : same as GET  /v1/me/templates
 *   - list_cloud_fonts        : same as GET  /v1/me/fonts
 *
 * The HTTP transport resolves the caller's `userId` (from the API key) and
 * provides it through `options.getUserId()`. Cloud-backed tool inputs error
 * out with a clear message when no user is authenticated.
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { convertMarkdownToPdf, type Template } from '../lib/converter';
import { buildTempPdfAbsoluteUrl } from '../lib/pdf-public-url';
import { storeTempPdf } from '../lib/pdf-temp-store';
import {
    ResolutionError,
    resolveFonts,
    resolveMarkdown,
    resolveTemplate,
    type FontSourceEntry,
} from '../lib/source-resolvers';
import {
    listUserFonts,
    listUserMarkdownFiles,
    listUserTemplates,
} from '../lib/cloud-store';

const fontEntrySchema = z.object({
    family: z.string().optional(),
    /** Base64-encoded font file bytes (TTF/OTF/WOFF). */
    font_raw: z.string().optional(),
    /** Path / id of a font in the caller's cloud storage. Requires auth. */
    font_cloud_filepath: z.string().optional(),
    /** Public HTTPS URL to a font file. */
    url: z.string().optional(),
});

const convertMarkdownInput = z.object({
    md_raw: z.string().optional().describe('Raw markdown content. Provide exactly one of md_raw / md_cloud_filepath.'),
    md_cloud_filepath: z
        .string()
        .optional()
        .describe('Path of a markdown file in your cloud storage (requires authenticated API key).'),
    template_raw: z
        .record(z.unknown())
        .optional()
        .nullable()
        .describe('Optional .mdt template JSON.'),
    template_cloud_filepath: z
        .string()
        .optional()
        .describe('Path of a template (.mdt/.json) in your cloud storage (requires authenticated API key).'),
    title: z.string().optional().describe('Optional document title'),
    variables: z.record(z.string()).optional().describe('Override `{{var:name}}` placeholders'),
    fonts: z
        .array(fontEntrySchema)
        .optional()
        .describe('Custom fonts: each entry uses exactly one of `font_raw` (base64) / `url` / `font_cloud_filepath`.'),
    includeTypstSource: z.boolean().optional().describe('When true, include generated Typst source in the response'),
    filename: z.string().optional().describe('Suggested PDF filename'),
});

type ConvertMarkdownPdfArgs = z.infer<typeof convertMarkdownInput>;
type FontArg = z.infer<typeof fontEntrySchema>;

export interface CreatePdfMcpServerOptions {
    /** Returns the authenticated user id for this MCP session, or null. */
    getUserId?: () => string | null;
}

function mapFontEntries(entries: FontArg[] | undefined): FontSourceEntry[] {
    if (!entries?.length) return [];
    return entries.map((f) => ({
        family: f.family,
        font_raw: f.font_raw,
        url: f.url,
        font_cloud_filepath: f.font_cloud_filepath,
    }));
}

function errorContent(message: string) {
    return {
        content: [{ type: 'text' as const, text: message }],
        isError: true,
    };
}

export function createPdfMcpServer(options: CreatePdfMcpServerOptions = {}): McpServer {
    const getUserId = options.getUserId ?? (() => null);

    const server = new McpServer(
        {
            name: 'modern-markdown-editor-pdf-api',
            version: '0.2.0',
        },
        {
            instructions:
                'This server converts Markdown to PDF using the Modern Markdown Editor Typst pipeline.\n' +
                '- `convert_markdown_to_pdf` accepts exactly one of `md_raw` / `md_cloud_filepath`, and at most one of ' +
                '`template_raw` / `template_cloud_filepath`. Returns JSON with a temporary `url` to download the PDF.\n' +
                '- `list_cloud_files`, `list_cloud_templates`, `list_cloud_fonts` enumerate the authenticated user\'s ' +
                'cloud-synced assets (requires a user API key — generate one in the editor under Settings → API Service).\n' +
                'Set `PUBLIC_BASE_URL` so URLs are absolute.',
        },
    );

    server.registerTool(
        'convert_markdown_to_pdf',
        {
            title: 'Markdown → PDF',
            description:
                'Compile Markdown to a PDF. Provide markdown via `md_raw` or `md_cloud_filepath` (cloud), ' +
                'optionally a template via `template_raw` or `template_cloud_filepath`, and optional `fonts`. ' +
                'Returns a time-limited download URL.',
            inputSchema: convertMarkdownInput as any,
        },
        async (args: unknown, _extra: unknown) => {
            const a = (args || {}) as ConvertMarkdownPdfArgs;
            const userId = getUserId() || undefined;

            try {
                const { markdown } = await resolveMarkdown(
                    { md_raw: a.md_raw, md_cloud_filepath: a.md_cloud_filepath },
                    { userId },
                );
                const { template } = await resolveTemplate(
                    {
                        template_raw: a.template_raw as Template | null | undefined,
                        template_cloud_filepath: a.template_cloud_filepath,
                    },
                    { userId },
                );
                const fonts = await resolveFonts(mapFontEntries(a.fonts), { userId });

                const { pdf, typstSource } = await convertMarkdownToPdf(
                    {
                        markdown,
                        template: template ?? null,
                        title: a.title,
                        variables: a.variables,
                        fonts,
                    },
                    { includeSource: !!a.includeTypstSource },
                );

                const filename =
                    (a.filename || a.title || 'document').replace(/[^A-Za-z0-9._\- ]+/g, '_').trim() ||
                    'document';
                const withExt = filename.toLowerCase().endsWith('.pdf') ? filename : `${filename}.pdf`;

                const { token, expiresAtMs } = storeTempPdf(pdf, withExt);
                const url = buildTempPdfAbsoluteUrl(token);

                const payload = {
                    filename: withExt,
                    mimeType: 'application/pdf',
                    url,
                    expiresAt: new Date(expiresAtMs).toISOString(),
                    byteLength: pdf.byteLength,
                    ...(typstSource !== undefined ? { typstSource } : {}),
                };

                return {
                    content: [{ type: 'text' as const, text: JSON.stringify(payload, null, 2) }],
                };
            } catch (e) {
                if (e instanceof ResolutionError) {
                    return errorContent(e.message);
                }
                const message = e instanceof Error ? e.message : String(e);
                return errorContent(`Conversion failed: ${message}`);
            }
        },
    );

    server.registerTool(
        'list_cloud_files',
        {
            title: 'List cloud markdown files',
            description:
                'List the authenticated user\'s cloud-saved markdown files (excludes templates). ' +
                'Requires a user API key (generated under Settings → API Service).',
            inputSchema: {} as any,
        },
        async () => {
            const userId = getUserId();
            if (!userId) {
                return errorContent(
                    'This tool requires a user API key. Generate one in the editor under Settings → API Service.',
                );
            }
            try {
                const files = await listUserMarkdownFiles(userId);
                const payload = {
                    files: files.map((f) => ({
                        filename: f.path.split('/').pop() || f.path,
                        filepath: f.path,
                        lastChanged: f.updatedAt,
                        lastChangedIso: new Date(f.updatedAt).toISOString(),
                        byteLength: f.content.length,
                    })),
                };
                return { content: [{ type: 'text' as const, text: JSON.stringify(payload, null, 2) }] };
            } catch (e) {
                const message = e instanceof Error ? e.message : String(e);
                return errorContent(`Failed to list cloud files: ${message}`);
            }
        },
    );

    server.registerTool(
        'list_cloud_templates',
        {
            title: 'List cloud templates',
            description:
                'List the authenticated user\'s cloud-saved templates (`Templates/**/*.mdt|.json`). ' +
                'Requires a user API key.',
            inputSchema: {} as any,
        },
        async () => {
            const userId = getUserId();
            if (!userId) {
                return errorContent(
                    'This tool requires a user API key. Generate one in the editor under Settings → API Service.',
                );
            }
            try {
                const templates = await listUserTemplates(userId);
                const payload = {
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
                            lastChangedIso: new Date(f.updatedAt).toISOString(),
                        };
                    }),
                };
                return { content: [{ type: 'text' as const, text: JSON.stringify(payload, null, 2) }] };
            } catch (e) {
                const message = e instanceof Error ? e.message : String(e);
                return errorContent(`Failed to list cloud templates: ${message}`);
            }
        },
    );

    server.registerTool(
        'list_cloud_fonts',
        {
            title: 'List cloud fonts',
            description:
                'List the authenticated user\'s cloud-saved custom fonts. ' +
                'Use `id` or `family` as `font_cloud_filepath` when calling `convert_markdown_to_pdf`. ' +
                'Requires a user API key.',
            inputSchema: {} as any,
        },
        async () => {
            const userId = getUserId();
            if (!userId) {
                return errorContent(
                    'This tool requires a user API key. Generate one in the editor under Settings → API Service.',
                );
            }
            try {
                const fonts = await listUserFonts(userId, false);
                const payload = {
                    fonts: fonts.map((f) => ({
                        id: f.id,
                        family: f.family,
                        fileName: f.fileName,
                        filepath: f.id,
                        format: f.format,
                        lastChanged: f.updatedAt,
                        lastChangedIso: new Date(f.updatedAt).toISOString(),
                    })),
                };
                return { content: [{ type: 'text' as const, text: JSON.stringify(payload, null, 2) }] };
            } catch (e) {
                const message = e instanceof Error ? e.message : String(e);
                return errorContent(`Failed to list cloud fonts: ${message}`);
            }
        },
    );

    return server;
}
