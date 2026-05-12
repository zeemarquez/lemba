/**
 * MCP server exposing the Modern Markdown Editor PDF pipeline plus
 * cloud-listing tools.
 *
 * Tools:
 *   - convert_markdown_to_pdf      : compile markdown to PDF (MCP-only, minimal args)
 *   - list_cloud_files             : list markdown documents + `folderPaths` (vault tree)
 *   - read_cloud_markdown_document : fetch markdown body by filepath or search query
 *   - upload_cloud_markdown_document : save markdown to cloud (optional folder)
 *   - list_cloud_templates         : list the user's cloud templates (.mdt/.json)
 *   - list_cloud_fonts             : list the user's cloud custom fonts
 *
 * The HTTP transport resolves the caller's `userId` from the API key and
 * provides it via `options.getUserId()`. Cloud-backed inputs return a clear
 * error when no user is authenticated.
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { convertMarkdownToPdf } from '../lib/converter';
import { buildTempPdfAbsoluteUrl } from '../lib/pdf-public-url';
import { storeTempPdf } from '../lib/pdf-temp-store';
import {
    ResolutionError,
    resolveMarkdown,
    resolveTemplate,
} from '../lib/source-resolvers';
import {
    getUserFileByPath,
    listUserFonts,
    listUserMarkdownFiles,
    listUserMarkdownFolderPaths,
    listUserTemplates,
    normalizeCloudFilepath,
    upsertUserMarkdownFile,
} from '../lib/cloud-store';
import { isFirebaseAdminConfigured } from '../lib/firebase-admin';
import { buildWebappFileDeepLink } from '../lib/webapp-file-link';

// ---------------------------------------------------------------------------
// Tool input schema — deliberately minimal so AI agents cannot get confused.
// Only two arguments are exposed:
//   * md_raw                  (required)  — the markdown body itself
//   * template_cloud_filepath (optional)  — exact filepath of a saved template
// ---------------------------------------------------------------------------

const convertInputShape = {
    md_raw: z.string().min(1).describe(
        [
            'REQUIRED. The full markdown body of the document to convert, passed as a string.',
            '',
            'Pass the actual markdown text directly (with real newlines). DO NOT pass:',
            '  • a filepath or filename',
            '  • a URL',
            '  • a short description of the document',
            '  • the name of a file in cloud storage',
            'You (the assistant) are expected to GENERATE the markdown yourself based on the user\'s request, then pass it here.',
            '',
            'Standard markdown is supported: headings (# .. ######), paragraphs, lists, tables, code blocks (```), images, links, blockquotes, footnotes, and math.',
            '',
            'Example value:',
            '  "# Quarterly Report\\n\\nThis quarter we shipped...\\n\\n## Highlights\\n- Item A\\n- Item B\\n"',
        ].join('\n'),
    ),
    template_cloud_filepath: z
        .string()
        .optional()
        .describe(
            [
                "OPTIONAL. The exact `filepath` of a template the user has saved in their cloud account, e.g. \"Templates/Dark.mdt\" or \"Templates/Reports/Invoice.json\".",
                '',
                'When to SET this:',
                '  • The user explicitly named or described a template (e.g. "use the dark template", "with my Invoice template", "in the Report style").',
                '  • To get the correct value you MUST FIRST call the `list_cloud_templates` tool, then pick the entry whose `name` or `filename` best matches what the user said (case-insensitive substring match is fine — e.g. user says "dark" → pick `{ name: "Dark", filepath: "Templates/Dark.mdt" }`). Pass that entry\'s `filepath` here, exactly as returned.',
                '  • If multiple templates plausibly match, ask the user to disambiguate.',
                '  • If none match, do NOT guess — tell the user which templates exist instead.',
                '',
                'When to OMIT this:',
                '  • The user did not mention a template. Leave the field unset.',
                '  • Do NOT pass "" (empty string), null, "none", "default", or any made-up path. Just omit the field entirely.',
                '',
                'Requires the user to be authenticated with an API key (generated in the editor under Settings → API Service).',
            ].join('\n'),
        ),
} as const;

const convertInputSchema = z.object(convertInputShape);
type ConvertMarkdownPdfArgs = z.infer<typeof convertInputSchema>;

const readCloudMarkdownInputShape = {
    filepath: z
        .string()
        .optional()
        .describe(
            [
                'Exact logical `filepath` of the document (same value as `filepath` on `list_cloud_files` entries).',
                'When the user named a file ambiguously, FIRST call `list_cloud_files`, pick the correct row, then pass its `filepath` here.',
                'If you pass this, `document_query` is ignored.',
            ].join('\n'),
        ),
    document_query: z
        .string()
        .optional()
        .describe(
            [
                'Use when you do not yet know the exact `filepath`.',
                'Matches against basename or full path (case-insensitive substring).',
                'If zero matches: tell the user no file matched and suggest `list_cloud_files`.',
                'If multiple matches: the tool returns `needsClarification` and a `candidates` list — ask the user which one, then call again with `filepath`.',
                'If exactly one match: the tool returns that document.',
            ].join('\n'),
        ),
} as const;

const readCloudMarkdownInputSchema = z.object(readCloudMarkdownInputShape).refine(
    (o) => !!(o.filepath?.trim() || o.document_query?.trim()),
    {
        message:
            'Provide `filepath` (from `list_cloud_files`) or `document_query` (filename / path fragment to search).',
    },
);

const uploadCloudMarkdownInputShape = {
    content: z
        .string()
        .min(1)
        .describe('Raw markdown body (UTF-8) to store in the user cloud vault.'),
    filename: z
        .string()
        .min(1)
        .describe(
            'Basename only (no slashes), e.g. `report.md`. Must end with `.md`, `.markdown`, or `.mdx`.',
        ),
    folder_path: z
        .string()
        .optional()
        .describe(
            [
                'Exact parent folder path with forward slashes, no leading slash (e.g. `Work/Clients`).',
                'Omit this field or use an empty string to upload to the vault root.',
                'Prefer values from `folderPaths` on `list_cloud_files`.',
                'If set to a non-empty string, `folder_query` is ignored.',
            ].join('\n'),
        ),
    folder_query: z
        .string()
        .optional()
        .describe(
            [
                'When the user described a folder vaguely (e.g. "put it in my Notes folder").',
                'FIRST call `list_cloud_files` and inspect `folderPaths`; then pass the user\'s words here.',
                'If multiple folders match, the tool returns `needsClarification` — ask the user, then call again with explicit `folder_path`.',
                'Omit when uploading to root or when `folder_path` is already known.',
            ].join('\n'),
        ),
} as const;

const uploadCloudMarkdownInputSchema = z.object(uploadCloudMarkdownInputShape);

function matchMarkdownFilesByDocumentQuery(
    files: Awaited<ReturnType<typeof listUserMarkdownFiles>>,
    queryRaw: string,
) {
    const query = queryRaw.trim();
    if (!query) return [];
    const ql = query.toLowerCase();
    return files.filter((f) => {
        const base = f.path.split('/').pop() || '';
        const bl = base.toLowerCase();
        const pl = f.path.toLowerCase();
        return (
            bl === ql ||
            pl === ql ||
            pl.endsWith(`/${ql}`) ||
            bl.includes(ql) ||
            pl.includes(ql)
        );
    });
}

function matchFolderPathsForQuery(folderPaths: string[], queryRaw: string): string[] {
    const query = queryRaw.trim();
    if (!query) return [];
    const ql = query.toLowerCase();
    const hits = new Set<string>();
    for (const p of folderPaths) {
        if (p === query || p.toLowerCase() === ql) hits.add(p);
        else {
            const seg = p.split('/').pop() || '';
            if (seg.toLowerCase() === ql) hits.add(p);
            else if (p.toLowerCase().endsWith(`/${ql}`)) hits.add(p);
        }
    }
    return Array.from(hits).sort((a, b) => b.length - a.length);
}

export interface CreatePdfMcpServerOptions {
    /** Returns the authenticated user id for this MCP session, or null. */
    getUserId?: () => string | null;
}

function errorContent(message: string) {
    return {
        content: [{ type: 'text' as const, text: message }],
        isError: true,
    };
}

const SERVER_INSTRUCTIONS = `Modern Markdown Editor — Markdown → PDF MCP server.

PURPOSE
  Turn user requests like "write a document about X and convert it to PDF" into a styled PDF the user can download. The assistant generates the markdown body itself; this server compiles it (using Typst under the hood) and returns a temporary download URL.

TOOLS
  • convert_markdown_to_pdf
      Inputs:
        - md_raw (string, required): the full markdown body, generated by YOU (the assistant).
        - template_cloud_filepath (string, optional): exact cloud filepath of a saved template.
      Output (JSON): { filename, mimeType, url, expiresAt, byteLength }. Share the \`url\` with the user.

  • list_cloud_templates
      Returns the authenticated user's saved templates as objects of the form
      { fileId, filename, name, filepath, type, isDeleted, lastChanged, lastChangedIso }.
      Use \`filepath\` as the \`template_cloud_filepath\` argument for the converter.

  • list_cloud_files
      Returns \`files\` (markdown documents, not templates) and \`folderPaths\` (parent folders for uploads).
      Each file includes \`filepath\` — use that with \`read_cloud_markdown_document\` and when resolving uploads.

  • read_cloud_markdown_document
      Returns JSON with the markdown \`content\` for one vault document. Requires user API key.
      Call \`list_cloud_files\` first when the path is unknown; pass \`filepath\`, or use \`document_query\` to search.
      If several files match, the tool returns \`needsClarification\` and \`candidates\` — ask the user, then retry with \`filepath\`.

  • upload_cloud_markdown_document
      Saves raw markdown to the user's cloud. Pass \`filename\` (basename, .md/.markdown/.mdx) and \`content\`.
      For folders: use exact \`folder_path\` from \`list_cloud_files.folderPaths\`, or \`folder_query\` for a vague name.
      Omit both for vault root. Ambiguous folder → \`needsClarification\` with \`candidates\`.
      Response includes \`webUrl\` — share this link so the user can open the file in the web app (requires local sync if the file was created only in the cloud).

  • list_cloud_fonts
      Returns the authenticated user's custom fonts.

WORKFLOW — MUST FOLLOW
  When the user asks the assistant to write/generate/produce a document and turn it into a PDF:

  1. WRITE THE MARKDOWN YOURSELF.
     Compose the document body in standard markdown based on the user's instructions. This text becomes the \`md_raw\` argument. Never put filepaths, URLs, or summaries in \`md_raw\` — put the actual markdown.

  2. RESOLVE THE TEMPLATE.
     a) Did the user mention a template by name? (e.g. "the dark template", "use my Invoice template", "in the Report style")
        YES → first call \`list_cloud_templates\`. From the returned list, find the entry whose \`name\` or \`filename\` best matches what the user said (case-insensitive substring match is fine — user says "dark" → match \`{name: "Dark", filepath: "Templates/Dark.mdt"}\`). Use that entry's \`filepath\` as \`template_cloud_filepath\`. If multiple plausibly match, ask the user. If none match, tell the user the available templates instead of guessing.
        NO  → omit \`template_cloud_filepath\` entirely. Do not invent a default and do not send an empty string.

  3. CALL convert_markdown_to_pdf with the markdown from step 1 and (if step 2 produced one) the template filepath.

  4. SHARE THE RESULT.
     Give the user the returned \`url\` and mention it expires at \`expiresAt\`.

EXAMPLES
  • User: "Write a one-page summary of last week's standup and convert it to PDF using the dark template."
      → call list_cloud_templates → find { name: "Dark", filepath: "Templates/Dark.mdt" }
      → call convert_markdown_to_pdf({ md_raw: "# Standup Summary\\n\\n...", template_cloud_filepath: "Templates/Dark.mdt" })

  • User: "Convert this to PDF" (no template named)
      → call convert_markdown_to_pdf({ md_raw: "..." })   // no template_cloud_filepath

  • User: "Make me a PDF with the report template"
      → call list_cloud_templates → only template is "Invoice"
      → tell the user: "I couldn't find a template called \\"report\\". Available templates: Invoice. Which one should I use?"

AUTHENTICATION
  All cloud features (list_cloud_*, read_cloud_*, upload_cloud_*, template_cloud_filepath) require a user API key.
  Users generate one in the editor under Settings → API Service and pass it as
  \`Authorization: Bearer mme_...\` when connecting to this MCP server.
  Without an API key the converter still works as long as you only provide \`md_raw\`.`;

export function createPdfMcpServer(options: CreatePdfMcpServerOptions = {}): McpServer {
    const getUserId = options.getUserId ?? (() => null);

    const server = new McpServer(
        {
            name: 'modern-markdown-editor-pdf-api',
            version: '0.4.0',
        },
        { instructions: SERVER_INSTRUCTIONS },
    );

    // ----- convert_markdown_to_pdf -----------------------------------------
    server.registerTool(
        'convert_markdown_to_pdf',
        {
            title: 'Convert Markdown to PDF',
            description:
                "Compile a markdown document to a styled PDF and return a temporary download URL.\n\n" +
                "Arguments:\n" +
                "  • md_raw (required): the FULL markdown body, generated by you (the assistant). Pass the actual markdown text, not a filepath or description.\n" +
                "  • template_cloud_filepath (optional): exact cloud `filepath` of one of the user's saved templates. " +
                "If the user mentions a template by name, FIRST call `list_cloud_templates` to look up its real `filepath`, then pass it here. " +
                "If the user did not mention a template, OMIT this field (don't send empty string or null).\n\n" +
                "Returns JSON: { filename, mimeType, url, expiresAt, byteLength }. Share `url` with the user.",
            inputSchema: convertInputShape as any,
        },
        async (args: unknown) => {
            const a = (args || {}) as ConvertMarkdownPdfArgs;
            const userId = getUserId() || undefined;

            try {
                const { markdown } = await resolveMarkdown({ md_raw: a.md_raw }, { userId });
                const { template } = await resolveTemplate(
                    { template_cloud_filepath: a.template_cloud_filepath },
                    { userId },
                );

                const { pdf } = await convertMarkdownToPdf(
                    { markdown, template: template ?? null },
                    { includeSource: false },
                );

                const filename = 'document.pdf';
                const { token, expiresAtMs } = storeTempPdf(pdf, filename);
                const url = buildTempPdfAbsoluteUrl(token);

                const payload = {
                    filename,
                    mimeType: 'application/pdf',
                    url,
                    expiresAt: new Date(expiresAtMs).toISOString(),
                    byteLength: pdf.byteLength,
                };

                return {
                    content: [{ type: 'text' as const, text: JSON.stringify(payload, null, 2) }],
                };
            } catch (e) {
                if (e instanceof ResolutionError) return errorContent(e.message);
                const message = e instanceof Error ? e.message : String(e);
                return errorContent(`Conversion failed: ${message}`);
            }
        },
    );

    // ----- list_cloud_files ------------------------------------------------
    server.registerTool(
        'list_cloud_files',
        {
            title: 'List cloud markdown files',
            description:
                "List the authenticated user's cloud-saved markdown documents (excludes templates) plus " +
                "`folderPaths` (distinct parent folders under the vault, excluding `Templates/`). " +
                "Each file object includes `fileId`, `filename`, `filepath`, `type`, `isDeleted`, " +
                "`lastChanged`, `lastChangedIso`, `byteLength`. " +
                "CALL THIS BEFORE `read_cloud_markdown_document` or `upload_cloud_markdown_document` when the user " +
                "did not give an exact `filepath` / folder. " +
                "Requires a user API key (Settings → API Service in the editor).",
            inputSchema: {} as any,
        },
        async () => {
            const userId = getUserId();
            if (!userId) {
                return errorContent(
                    'This tool requires a user API key. Generate one in the editor under Settings → API Service.',
                );
            }
            if (!isFirebaseAdminConfigured()) {
                return errorContent(
                    'Cloud storage is not configured on this API deployment (Firebase Admin SDK).',
                );
            }
            try {
                const [files, folderPaths] = await Promise.all([
                    listUserMarkdownFiles(userId),
                    listUserMarkdownFolderPaths(userId),
                ]);
                const payload = {
                    files: files.map((f) => ({
                        fileId: f.syncId,
                        filename: f.path.split('/').pop() || f.path,
                        filepath: f.path,
                        type: f.type,
                        isDeleted: f.isDeleted,
                        lastChanged: f.updatedAt,
                        lastChangedIso: new Date(f.updatedAt).toISOString(),
                        byteLength: f.content.length,
                    })),
                    folderPaths,
                };
                return { content: [{ type: 'text' as const, text: JSON.stringify(payload, null, 2) }] };
            } catch (e) {
                const message = e instanceof Error ? e.message : String(e);
                return errorContent(`Failed to list cloud files: ${message}`);
            }
        },
    );

    // ----- read_cloud_markdown_document ------------------------------------
    server.registerTool(
        'read_cloud_markdown_document',
        {
            title: 'Read cloud markdown document',
            description:
                'Download one markdown document from the user\'s cloud vault as UTF-8 text.\n\n' +
                'WORKFLOW:\n' +
                '  1. If you do not already know the exact `filepath`, call `list_cloud_files` first.\n' +
                '  2. Pass `filepath` (copied from a list row) **or** pass `document_query` to search by name/path fragment.\n' +
                '  3. If the tool returns `needsClarification` with multiple `candidates`, ask the user which file they mean, then call again with `filepath` only.\n\n' +
                'Returns JSON: `filepath`, `fileId`, `content` (the markdown), `lastChanged`, `lastChangedIso`, `byteLength`.\n\n' +
                'Requires a user API key.',
            inputSchema: readCloudMarkdownInputShape as any,
        },
        async (args: unknown) => {
            const parsed = readCloudMarkdownInputSchema.safeParse(args ?? {});
            if (!parsed.success) {
                const msg = parsed.error.issues.map((i) => i.message).join('; ');
                return errorContent(msg || 'Invalid arguments');
            }
            const userId = getUserId();
            if (!userId) {
                return errorContent(
                    'This tool requires a user API key. Generate one in the editor under Settings → API Service.',
                );
            }
            if (!isFirebaseAdminConfigured()) {
                return errorContent(
                    'Cloud storage is not configured on this API deployment (Firebase Admin SDK).',
                );
            }
            const { filepath, document_query } = parsed.data;
            let resolvedPath: string | null = null;
            try {
                if (filepath?.trim()) {
                    resolvedPath = normalizeCloudFilepath(filepath.trim());
                } else if (document_query?.trim()) {
                    const files = await listUserMarkdownFiles(userId);
                    const matches = matchMarkdownFilesByDocumentQuery(files, document_query.trim());
                    if (matches.length === 0) {
                        return {
                            content: [
                                {
                                    type: 'text' as const,
                                    text: JSON.stringify(
                                        {
                                            found: false,
                                            message:
                                                'No document matched `document_query`. Call `list_cloud_files`, pick a `filepath`, and call this tool again with `filepath`.',
                                        },
                                        null,
                                        2,
                                    ),
                                },
                            ],
                        };
                    }
                    if (matches.length > 1) {
                        return {
                            content: [
                                {
                                    type: 'text' as const,
                                    text: JSON.stringify(
                                        {
                                            needsClarification: true,
                                            message:
                                                'Multiple documents matched. Ask the user which one they mean, then call again with `filepath` set to that row\'s `filepath` (and omit `document_query`).',
                                            candidates: matches.map((f) => ({
                                                filepath: f.path,
                                                filename: f.path.split('/').pop() || f.path,
                                                byteLength: f.content.length,
                                                lastChangedIso: new Date(f.updatedAt).toISOString(),
                                            })),
                                        },
                                        null,
                                        2,
                                    ),
                                },
                            ],
                        };
                    }
                    resolvedPath = matches[0]!.path;
                }
            } catch (e) {
                const message = e instanceof Error ? e.message : String(e);
                return errorContent(message);
            }

            const file = await getUserFileByPath(userId, resolvedPath!);
            if (!file) {
                return errorContent(
                    `No file at "${resolvedPath}". Call \`list_cloud_files\` to see valid \`filepath\` values.`,
                );
            }
            if (file.type === 'folder') {
                return errorContent(`"${resolvedPath}" is a folder, not a file.`);
            }
            const payload = {
                filepath: file.path,
                fileId: file.syncId,
                content: file.content,
                lastChanged: file.updatedAt,
                lastChangedIso: new Date(file.updatedAt).toISOString(),
                byteLength: file.content.length,
            };
            return { content: [{ type: 'text' as const, text: JSON.stringify(payload, null, 2) }] };
        },
    );

    // ----- upload_cloud_markdown_document ----------------------------------
    server.registerTool(
        'upload_cloud_markdown_document',
        {
            title: 'Upload cloud markdown document',
            description:
                'Create or replace a markdown file in the user\'s cloud vault (same behavior as `POST /v1/me/files/upload`).\n\n' +
                'WORKFLOW:\n' +
                '  1. Call `list_cloud_files` when the user mentioned a folder vaguely — use the `folderPaths` array.\n' +
                '  2. Pass exact `folder_path` from that list, **or** pass `folder_query` and let the tool match.\n' +
                '  3. If the tool returns `needsClarification` for folders, ask the user, then retry with `folder_path`.\n' +
                '  4. If the user did not specify a folder, omit both `folder_path` and `folder_query` (vault root).\n\n' +
                '`filename` must be a basename ending in `.md`, `.markdown`, or `.mdx`.\n\n' +
                'Returns JSON: `filepath`, `fileId`, `created` (true when a new file was written), and `webUrl` (open in the web app).\n\n' +
                'Requires a user API key.',
            inputSchema: uploadCloudMarkdownInputShape as any,
        },
        async (args: unknown) => {
            const parsed = uploadCloudMarkdownInputSchema.safeParse(args ?? {});
            if (!parsed.success) {
                const msg = parsed.error.issues.map((i) => i.message).join('; ');
                return errorContent(msg || 'Invalid arguments');
            }
            const userId = getUserId();
            if (!userId) {
                return errorContent(
                    'This tool requires a user API key. Generate one in the editor under Settings → API Service.',
                );
            }
            if (!isFirebaseAdminConfigured()) {
                return errorContent(
                    'Cloud storage is not configured on this API deployment (Firebase Admin SDK).',
                );
            }
            const a = parsed.data;
            let folderPath = '';
            try {
                if (a.folder_path !== undefined) {
                    folderPath = a.folder_path.trim();
                } else if (a.folder_query?.trim()) {
                    const folders = await listUserMarkdownFolderPaths(userId);
                    const matches = matchFolderPathsForQuery(folders, a.folder_query.trim());
                    if (matches.length === 0) {
                        return {
                            content: [
                                {
                                    type: 'text' as const,
                                    text: JSON.stringify(
                                        {
                                            needsClarification: false,
                                            message:
                                                'No folder matched `folder_query`. Call `list_cloud_files`, choose a path from `folderPaths`, and pass it as `folder_path` (or retry with a clearer `folder_query`).',
                                            folderPaths: folders,
                                        },
                                        null,
                                        2,
                                    ),
                                },
                            ],
                        };
                    }
                    if (matches.length > 1) {
                        return {
                            content: [
                                {
                                    type: 'text' as const,
                                    text: JSON.stringify(
                                        {
                                            needsClarification: true,
                                            message:
                                                'Multiple folders matched. Ask the user which folder they mean, then call again with `folder_path` set to the exact string (omit `folder_query`).',
                                            candidates: matches,
                                        },
                                        null,
                                        2,
                                    ),
                                },
                            ],
                        };
                    }
                    folderPath = matches[0]!;
                }
            } catch (e) {
                const message = e instanceof Error ? e.message : String(e);
                return errorContent(message);
            }

            try {
                const result = await upsertUserMarkdownFile(userId, {
                    folderPath,
                    filename: a.filename,
                    content: a.content,
                });
                const payload = {
                    filepath: result.path,
                    fileId: result.syncId,
                    created: result.created,
                    webUrl: buildWebappFileDeepLink(result.syncId),
                };
                return { content: [{ type: 'text' as const, text: JSON.stringify(payload, null, 2) }] };
            } catch (e) {
                const message = e instanceof Error ? e.message : String(e);
                return errorContent(`Upload failed: ${message}`);
            }
        },
    );

    // ----- list_cloud_templates -------------------------------------------
    server.registerTool(
        'list_cloud_templates',
        {
            title: 'List cloud templates',
            description:
                "List the authenticated user's saved templates (under `Templates/`, suffix `.mdt` or `.json`).\n\n" +
                "CALL THIS BEFORE `convert_markdown_to_pdf` whenever the user mentions a template by name " +
                "(e.g. \"the dark template\", \"my Invoice template\"). Match the user's words to a returned " +
                "entry by comparing against `name` (preferred) or `filename`, then pass that entry's `filepath` " +
                "as `template_cloud_filepath` in the converter call.\n\n" +
                "Returns objects with `fileId`, `filename`, `name` (human-readable), `filepath`, `type`, " +
                "`isDeleted`, `lastChanged`, `lastChangedIso`.\n\n" +
                "Requires a user API key (Settings → API Service in the editor).",
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
                            if (parsed && typeof parsed.name === 'string' && parsed.name) {
                                name = parsed.name;
                            }
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

    // ----- list_cloud_fonts ------------------------------------------------
    server.registerTool(
        'list_cloud_fonts',
        {
            title: 'List cloud fonts',
            description:
                "List the authenticated user's saved custom fonts. Returns objects with `id`, `family`, " +
                "`fileName`, `filepath`, `format`, `lastChanged`, `lastChangedIso`. Informational only — " +
                "fonts cannot be selected through this MCP server's converter (they are configured inside " +
                "the template itself). Requires a user API key.",
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
