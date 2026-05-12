/**
 * OpenAPI 3.0 document for the PDF conversion API.
 * Served at GET /openapi.json and interactive UI at GET /docs.
 */

export const openApiDocument = {
    openapi: '3.0.3',
    info: {
        title: 'Modern Markdown Editor — PDF API',
        description:
            'Convert Markdown documents to PDF using the same Typst pipeline as the Modern Markdown Editor app.\n\n' +
            'Authentication (optional): send `Authorization: Bearer <token>` or `x-api-key: <token>`. Two token types are accepted:\n' +
            '  - The shared `API_KEY` env value (legacy admin mode — no user context).\n' +
            '  - A personal user token (`mme_*`) generated in the editor under **Settings → API Service**. ' +
            'Tokens carry a user id, enabling cloud-backed sources (`md_cloud_filepath`, `template_cloud_filepath`, ' +
            '`font_cloud_filepath`) and the `/v1/me/*` endpoints (including markdown read/write).',
        version: '0.2.1',
        license: { name: 'MIT' },
    },
    servers: [{ url: '/', description: 'Current host' }],
    tags: [
        { name: 'Health', description: 'Liveness' },
        { name: 'Convert', description: 'Markdown → PDF' },
        { name: 'Me', description: 'Cloud-saved files for the authenticated user (read; markdown upload under `/v1/me/files`)' },
    ],
    paths: {
        '/health': {
            get: {
                tags: ['Health'],
                summary: 'Health check',
                operationId: 'getHealth',
                responses: {
                    '200': {
                        description: 'Service is running',
                        content: {
                            'application/json': {
                                schema: { $ref: '#/components/schemas/HealthResponse' },
                                example: { status: 'ok', service: 'modern-markdown-editor-api', version: '0.1.0' },
                            },
                        },
                    },
                },
            },
        },
        '/v1/convert': {
            post: {
                tags: ['Convert'],
                summary: 'Convert (JSON body)',
                description:
                    'Send a markdown source and optional template/fonts as JSON. ' +
                    'Provide markdown via exactly one of `md_raw` or `md_cloud_filepath`. ' +
                    'Provide a template via at most one of `template_raw` or `template_cloud_filepath`. ' +
                    '`*_cloud_filepath` requires a personal user token.',
                operationId: 'convertJson',
                security: [{ bearerAuth: [] }, { apiKeyHeader: [] }],
                requestBody: {
                    required: true,
                    content: {
                        'application/json': {
                            schema: { $ref: '#/components/schemas/ConvertJsonRequest' },
                        },
                    },
                },
                responses: {
                    '200': {
                        description: 'PDF bytes (binary), JSON with base64, or JSON with temporary URL',
                        content: {
                            'application/pdf': { schema: { type: 'string', format: 'binary' } },
                            'application/json': {
                                oneOf: [
                                    { $ref: '#/components/schemas/ConvertBase64Response' },
                                    { $ref: '#/components/schemas/ConvertUrlResponse' },
                                ],
                            },
                        },
                    },
                    '400': { description: 'Bad request', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
                    '401': { description: 'Missing or invalid API key', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
                    '404': { description: 'Cloud resource not found', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
                    '500': { description: 'Conversion failed', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
                },
            },
        },
        '/v1/convert/pdf/{token}': {
            get: {
                tags: ['Convert'],
                summary: 'Download temporary PDF',
                description:
                    'Returns PDF bytes for a token issued by `POST /v1/convert` with `output: "url"`. ' +
                    'The token expires after `PDF_TEMP_URL_TTL_SECONDS` (default 900). No API key is required; the token is the credential.',
                operationId: 'getTempPdf',
                parameters: [
                    {
                        name: 'token',
                        in: 'path',
                        required: true,
                        schema: { type: 'string', pattern: '^[a-fA-F0-9]{48}$' },
                        description: 'Opaque hex token from the convert response',
                    },
                ],
                responses: {
                    '200': {
                        description: 'PDF bytes',
                        content: { 'application/pdf': { schema: { type: 'string', format: 'binary' } } },
                    },
                    '400': { description: 'Invalid token format' },
                    '404': { description: 'Unknown or expired token' },
                },
            },
        },
        '/v1/convert/multipart': {
            post: {
                tags: ['Convert'],
                summary: 'Convert (multipart)',
                description:
                    'Upload markdown as `md_file` (binary part) or send `md_raw` / `md_cloud_filepath` text fields. ' +
                    'Template can be a `template_file` part, `template_raw` text field (JSON), or `template_cloud_filepath`. ' +
                    'Fonts: repeatable `font_files` (binary) for inline uploads, plus a `fonts` text field with a JSON array of ' +
                    '`{ family?, url? | font_raw? | font_cloud_filepath? }`.',
                operationId: 'convertMultipart',
                security: [{ bearerAuth: [] }, { apiKeyHeader: [] }],
                requestBody: {
                    required: true,
                    content: {
                        'multipart/form-data': {
                            schema: {
                                type: 'object',
                                properties: {
                                    md_raw: { type: 'string', description: 'Raw markdown body' },
                                    md_file: { type: 'string', format: 'binary', description: 'Markdown file upload' },
                                    md_cloud_filepath: {
                                        type: 'string',
                                        description: 'Cloud filepath, e.g. `notes/report.md`. Requires authenticated user token.',
                                    },
                                    template_raw: { type: 'string', description: 'Inline template JSON' },
                                    template_file: { type: 'string', format: 'binary', description: 'Upload `.mdt` template file' },
                                    template_cloud_filepath: {
                                        type: 'string',
                                        description: 'Cloud filepath, e.g. `Templates/Default Templates/Basic.mdt`.',
                                    },
                                    title: { type: 'string', example: 'My Report' },
                                    variables: {
                                        type: 'string',
                                        description: 'JSON object of placeholder values, e.g. `{"author":"Ada"}`',
                                    },
                                    fonts: {
                                        type: 'string',
                                        description: 'JSON array, e.g. `[{"family":"Inter","url":"https://..."},{"font_cloud_filepath":"inter"}]`',
                                    },
                                    font_files: {
                                        type: 'string',
                                        format: 'binary',
                                        description: 'Optional font file (repeat to upload multiple).',
                                    },
                                    output: { type: 'string', enum: ['binary', 'base64', 'url'], default: 'binary' },
                                    debug: { type: 'string', enum: ['0', '1', 'true', 'false'] },
                                    filename: { type: 'string', example: 'report.pdf' },
                                },
                            },
                        },
                    },
                },
                responses: {
                    '200': {
                        description: 'PDF bytes or JSON (base64 or temporary URL)',
                        content: {
                            'application/pdf': { schema: { type: 'string', format: 'binary' } },
                            'application/json': {
                                oneOf: [
                                    { $ref: '#/components/schemas/ConvertBase64Response' },
                                    { $ref: '#/components/schemas/ConvertUrlResponse' },
                                ],
                            },
                        },
                    },
                    '400': { description: 'Bad request', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
                    '401': { description: 'Unauthorized', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
                    '404': { description: 'Cloud resource not found', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
                    '500': { description: 'Conversion failed', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
                },
            },
        },
        '/v1/me/files': {
            get: {
                tags: ['Me'],
                summary: 'List cloud markdown files',
                description: 'Returns the authenticated user\'s cloud-synced markdown files (excludes templates).',
                operationId: 'listMyFiles',
                security: [{ bearerAuth: [] }, { apiKeyHeader: [] }],
                responses: {
                    '200': {
                        description: 'List of files',
                        content: {
                            'application/json': {
                                schema: { $ref: '#/components/schemas/CloudFilesResponse' },
                            },
                        },
                    },
                    '401': { description: 'Requires user API key' },
                },
            },
        },
        '/v1/me/files/content': {
            get: {
                tags: ['Me'],
                summary: 'Get cloud file body',
                description:
                    'Returns the UTF-8 `content` of a file at `filepath` (same logical path as `md_cloud_filepath`). ' +
                    'Folders return 400.',
                operationId: 'getMyFileContent',
                security: [{ bearerAuth: [] }, { apiKeyHeader: [] }],
                parameters: [
                    {
                        name: 'filepath',
                        in: 'query',
                        required: true,
                        schema: { type: 'string', example: 'notes/report.md' },
                        description: 'Logical path in the user\'s cloud (no leading slash)',
                    },
                ],
                responses: {
                    '200': {
                        description: 'File metadata and body',
                        content: {
                            'application/json': {
                                schema: { $ref: '#/components/schemas/CloudFileContentResponse' },
                            },
                        },
                    },
                    '400': { description: 'Missing filepath or path is a folder' },
                    '401': { description: 'Requires user API key' },
                    '404': { description: 'File not found' },
                    '503': { description: 'Firebase Admin not configured' },
                },
            },
        },
        '/v1/me/files/upload': {
            post: {
                tags: ['Me'],
                summary: 'Upload or replace markdown',
                description:
                    'Creates or updates a markdown file at `folderPath`/`filename`. Parent folders in `folderPath` are created when missing. ' +
                    '`filename` must end with `.md`, `.markdown`, or `.mdx`. Use `folderPath: ""` for the vault root.',
                operationId: 'uploadMyMarkdown',
                security: [{ bearerAuth: [] }, { apiKeyHeader: [] }],
                requestBody: {
                    required: true,
                    content: {
                        'application/json': {
                            schema: { $ref: '#/components/schemas/UploadMarkdownRequest' },
                        },
                    },
                },
                responses: {
                    '200': { description: 'Existing file updated', content: { 'application/json': { schema: { $ref: '#/components/schemas/UploadMarkdownResponse' } } } },
                    '201': { description: 'New file created', content: { 'application/json': { schema: { $ref: '#/components/schemas/UploadMarkdownResponse' } } } },
                    '400': { description: 'Invalid body or path conflict' },
                    '401': { description: 'Requires user API key' },
                    '503': { description: 'Firebase Admin not configured' },
                },
            },
        },
        '/v1/me/templates': {
            get: {
                tags: ['Me'],
                summary: 'List cloud templates',
                description: 'Returns the authenticated user\'s cloud-saved `.mdt`/`.json` template files under `Templates/`.',
                operationId: 'listMyTemplates',
                security: [{ bearerAuth: [] }, { apiKeyHeader: [] }],
                responses: {
                    '200': {
                        description: 'List of templates',
                        content: {
                            'application/json': {
                                schema: { $ref: '#/components/schemas/CloudTemplatesResponse' },
                            },
                        },
                    },
                    '401': { description: 'Requires user API key' },
                },
            },
        },
        '/v1/me/fonts': {
            get: {
                tags: ['Me'],
                summary: 'List cloud fonts',
                description: 'Returns the authenticated user\'s cloud-saved custom fonts.',
                operationId: 'listMyFonts',
                security: [{ bearerAuth: [] }, { apiKeyHeader: [] }],
                responses: {
                    '200': {
                        description: 'List of fonts',
                        content: {
                            'application/json': {
                                schema: { $ref: '#/components/schemas/CloudFontsResponse' },
                            },
                        },
                    },
                    '401': { description: 'Requires user API key' },
                },
            },
        },
    },
    components: {
        securitySchemes: {
            bearerAuth: {
                type: 'http',
                scheme: 'bearer',
                bearerFormat: 'API key',
                description: 'Send `Authorization: Bearer <token>`. Token is either the shared `API_KEY` or a personal `mme_*` token.',
            },
            apiKeyHeader: {
                type: 'apiKey',
                in: 'header',
                name: 'x-api-key',
                description: 'Alternative to Bearer.',
            },
        },
        schemas: {
            HealthResponse: {
                type: 'object',
                properties: {
                    status: { type: 'string', example: 'ok' },
                    service: { type: 'string' },
                    version: { type: 'string' },
                },
            },
            Error: {
                type: 'object',
                properties: {
                    error: { type: 'string' },
                    message: { type: 'string' },
                },
            },
            FontSource: {
                type: 'object',
                description: 'One font entry. Exactly one of `font_raw`, `url`, or `font_cloud_filepath` may be set.',
                properties: {
                    family: { type: 'string', description: 'CSS font-family used in the template settings.' },
                    font_raw: { type: 'string', description: 'Base64-encoded font file bytes.' },
                    url: { type: 'string', format: 'uri', description: 'HTTPS URL to a TTF/OTF/WOFF file.' },
                    font_cloud_filepath: {
                        type: 'string',
                        description: 'Cloud font identifier (the font `id` or `family`). Requires a user API key.',
                    },
                },
            },
            Template: {
                type: 'object',
                description: 'Same structure as a `.mdt` file from the editor',
                properties: {
                    id: { type: 'string' },
                    name: { type: 'string' },
                    settings: { type: 'object', additionalProperties: true },
                },
            },
            ConvertJsonRequest: {
                type: 'object',
                description:
                    'Exactly one of `md_raw` / `md_cloud_filepath` is required. At most one of `template_raw` / `template_cloud_filepath`. ' +
                    'For backwards compatibility, `markdown` and `template` are still accepted as aliases of `md_raw` and `template_raw`.',
                properties: {
                    md_raw: { type: 'string', description: 'Inline markdown body (YAML frontmatter allowed).' },
                    md_cloud_filepath: {
                        type: 'string',
                        description: 'Path of a markdown file in the user\'s cloud storage. Requires a user API key.',
                    },
                    markdown: { type: 'string', description: 'Deprecated alias of `md_raw`.' },
                    template_raw: { $ref: '#/components/schemas/Template' },
                    template_cloud_filepath: {
                        type: 'string',
                        description: 'Path of a `.mdt`/`.json` template in the user\'s cloud storage.',
                    },
                    template: { $ref: '#/components/schemas/Template' },
                    title: { type: 'string' },
                    variables: { type: 'object', additionalProperties: { type: 'string' } },
                    fonts: {
                        type: 'array',
                        items: { $ref: '#/components/schemas/FontSource' },
                    },
                    output: { type: 'string', enum: ['binary', 'base64', 'url'], default: 'binary' },
                    debug: { type: 'boolean' },
                    filename: { type: 'string' },
                },
            },
            ConvertBase64Response: {
                type: 'object',
                required: ['filename', 'mimeType', 'base64', 'byteLength'],
                properties: {
                    filename: { type: 'string' },
                    mimeType: { type: 'string', example: 'application/pdf' },
                    base64: { type: 'string' },
                    byteLength: { type: 'integer' },
                    typstSource: { type: 'string' },
                },
            },
            ConvertUrlResponse: {
                type: 'object',
                required: ['filename', 'mimeType', 'url', 'expiresAt', 'byteLength'],
                properties: {
                    filename: { type: 'string' },
                    mimeType: { type: 'string', example: 'application/pdf' },
                    url: { type: 'string', format: 'uri' },
                    expiresAt: { type: 'string', format: 'date-time' },
                    byteLength: { type: 'integer' },
                    typstSource: { type: 'string' },
                },
            },
            CloudFileItem: {
                type: 'object',
                properties: {
                    filename: { type: 'string' },
                    filepath: { type: 'string' },
                    lastChanged: { type: 'integer', description: 'Unix millis' },
                    lastChangedIso: { type: 'string', format: 'date-time' },
                    byteLength: { type: 'integer' },
                },
            },
            CloudTemplateItem: {
                type: 'object',
                properties: {
                    filename: { type: 'string' },
                    name: { type: 'string' },
                    filepath: { type: 'string' },
                    lastChanged: { type: 'integer' },
                    lastChangedIso: { type: 'string', format: 'date-time' },
                },
            },
            CloudFontItem: {
                type: 'object',
                properties: {
                    id: { type: 'string' },
                    family: { type: 'string' },
                    fileName: { type: 'string' },
                    filepath: { type: 'string', description: 'Same value as `id`; usable as `font_cloud_filepath`.' },
                    format: { type: 'string' },
                    lastChanged: { type: 'integer' },
                    lastChangedIso: { type: 'string', format: 'date-time' },
                },
            },
            CloudFilesResponse: {
                type: 'object',
                properties: {
                    files: { type: 'array', items: { $ref: '#/components/schemas/CloudFileItem' } },
                },
            },
            CloudFileContentResponse: {
                type: 'object',
                properties: {
                    filepath: { type: 'string' },
                    fileId: { type: 'string', description: 'Firestore sync id (document id)' },
                    content: { type: 'string' },
                    lastChanged: { type: 'integer' },
                    lastChangedIso: { type: 'string', format: 'date-time' },
                    byteLength: { type: 'integer' },
                },
            },
            UploadMarkdownRequest: {
                type: 'object',
                required: ['content', 'filename'],
                properties: {
                    content: { type: 'string', description: 'Raw markdown (UTF-8)' },
                    filename: { type: 'string', example: 'report.md', description: 'Basename only; must end with .md, .markdown, or .mdx' },
                    folderPath: {
                        type: 'string',
                        example: 'Projects/Acme',
                        description: 'Parent folder path without leading slash; empty string for root. Missing segments are created as folders.',
                    },
                },
            },
            UploadMarkdownResponse: {
                type: 'object',
                properties: {
                    filepath: { type: 'string' },
                    fileId: { type: 'string' },
                    created: { type: 'boolean', description: 'True when a new document was written; false when an existing path was updated.' },
                    webUrl: {
                        type: 'string',
                        format: 'uri',
                        description: 'Deep link to open this file in the web app (`WEBAPP_BASE_URL/{fileId}`).',
                    },
                },
            },
            CloudTemplatesResponse: {
                type: 'object',
                properties: {
                    templates: { type: 'array', items: { $ref: '#/components/schemas/CloudTemplateItem' } },
                },
            },
            CloudFontsResponse: {
                type: 'object',
                properties: {
                    fonts: { type: 'array', items: { $ref: '#/components/schemas/CloudFontItem' } },
                },
            },
        },
    },
} as const;

export type OpenApiDocument = typeof openApiDocument;
