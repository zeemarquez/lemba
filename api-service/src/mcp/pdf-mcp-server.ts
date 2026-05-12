/**
 * MCP server exposing the PDF conversion pipeline (same as POST /v1/convert).
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { convertMarkdownToPdf } from '../lib/converter';
import type { Template } from '../lib/converter';
import type { FontInput } from '../lib/typst/fonts';

const fontEntrySchema = z.object({
    family: z.string().optional(),
    url: z.string().optional(),
    /** Base64-encoded font file bytes (TTF/OTF/WOFF). */
    dataBase64: z.string().optional(),
});

type FontArg = {
    family?: string;
    url?: string;
    dataBase64?: string;
};

type ConvertMarkdownPdfArgs = {
    markdown: string;
    template?: Record<string, unknown> | null;
    title?: string;
    variables?: Record<string, string>;
    fonts?: FontArg[];
    includeTypstSource?: boolean;
    filename?: string;
};

const convertMarkdownInput = z.object({
    markdown: z.string().describe('Markdown document body'),
    template: z.record(z.unknown()).optional().nullable().describe('Optional .mdt template JSON (same as REST `template`)'),
    title: z.string().optional().describe('Optional document title'),
    variables: z.record(z.string()).optional().describe('Override {{var:name}} placeholders'),
    fonts: z.array(fontEntrySchema).optional().describe('Custom fonts by URL or embedded base64 (`dataBase64`)'),
    includeTypstSource: z.boolean().optional().describe('When true, include generated Typst source in the response'),
    filename: z.string().optional().describe('Suggested PDF filename'),
});

function decodeFonts(fonts: FontArg[] | undefined): FontInput[] {
    if (!fonts?.length) return [];
    return fonts.map((f) => {
        const base: FontInput = {};
        if (f.family !== undefined) base.family = f.family;
        if (f.url !== undefined) base.url = f.url;
        if (f.dataBase64 !== undefined) {
            base.data = new Uint8Array(Buffer.from(f.dataBase64, 'base64'));
        }
        return base;
    });
}

export function createPdfMcpServer(): McpServer {
    const server = new McpServer(
        {
            name: 'modern-markdown-editor-pdf-api',
            version: '0.1.0',
        },
        {
            instructions:
                'This server converts Markdown to PDF using the Modern Markdown Editor Typst pipeline. ' +
                'Call `convert_markdown_to_pdf` with `markdown` and optional `template`, `title`, `variables`, and `fonts`. ' +
                'The tool returns the PDF as an MCP embedded resource (`application/pdf`), not a text JSON wrapper. ' +
                'For large fonts, prefer `url` over embedding `dataBase64`.',
        },
    );

    server.registerTool(
        'convert_markdown_to_pdf',
        {
            title: 'Markdown → PDF',
            description:
                'Compile Markdown to a PDF file. Returns the PDF as an MCP resource (`application/pdf`), same bytes as `POST /v1/convert` with `output: "binary"`.',
            inputSchema: convertMarkdownInput as any,
        },
        async (args: unknown, _extra: unknown) => {
            const a = args as ConvertMarkdownPdfArgs;
            try {
                const template = (a.template ?? null) as Template | null;
                const fonts = decodeFonts(a.fonts);

                const { pdf, typstSource } = await convertMarkdownToPdf(
                    {
                        markdown: a.markdown,
                        template,
                        title: a.title,
                        variables: a.variables,
                        fonts,
                    },
                    { includeSource: !!a.includeTypstSource },
                );

                const filename = (a.filename || a.title || 'document').replace(/[^A-Za-z0-9._\- ]+/g, '_').trim() || 'document';
                const withExt = filename.toLowerCase().endsWith('.pdf') ? filename : `${filename}.pdf`;
                const uriPath = withExt.replace(/\s+/g, '_');

                const content: Array<
                    | { type: 'resource'; resource: { uri: string; mimeType: string; blob: string } }
                    | { type: 'text'; text: string }
                > = [
                    {
                        type: 'resource',
                        resource: {
                            uri: `file:///${uriPath}`,
                            mimeType: 'application/pdf',
                            blob: Buffer.from(pdf).toString('base64'),
                        },
                    },
                ];
                if (typstSource !== undefined) {
                    content.push({ type: 'text', text: typstSource });
                }

                return { content };
            } catch (e) {
                const message = e instanceof Error ? e.message : String(e);
                return {
                    content: [{ type: 'text' as const, text: `Conversion failed: ${message}` }],
                    isError: true,
                };
            }
        },
    );

    return server;
}
