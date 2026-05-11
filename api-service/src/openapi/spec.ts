/**
 * OpenAPI 3.0 document for the PDF conversion API.
 * Served at GET /openapi.json and interactive UI at GET /docs.
 */

export const openApiDocument = {
    openapi: '3.0.3',
    info: {
        title: 'Modern Markdown Editor — PDF API',
        description:
            'Convert Markdown documents to PDF using the same Typst pipeline as the Modern Markdown Editor app. ' +
            'Templates use the `.mdt` JSON format (`settings` object). ' +
            'When `API_KEY` is set on the server, send `Authorization: Bearer <key>` or header `x-api-key`.',
        version: '0.1.0',
        license: { name: 'MIT' },
    },
    servers: [{ url: '/', description: 'Current host' }],
    tags: [
        { name: 'Health', description: 'Liveness' },
        { name: 'Convert', description: 'Markdown → PDF' },
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
                    'Send Markdown and optional template settings as JSON. ' +
                    'Response is `application/pdf` by default, or JSON with base64 when `output` is `base64`.',
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
                        description: 'PDF bytes (default) or JSON with base64 PDF',
                        content: {
                            'application/pdf': { schema: { type: 'string', format: 'binary' } },
                            'application/json': { schema: { $ref: '#/components/schemas/ConvertBase64Response' } },
                        },
                    },
                    '400': { description: 'Bad request', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
                    '401': { description: 'Missing or invalid API key', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
                    '500': { description: 'Conversion failed', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
                },
            },
        },
        '/v1/convert/multipart': {
            post: {
                tags: ['Convert'],
                summary: 'Convert (multipart)',
                description:
                    'Upload `markdown` as a file or text field, optional `template` as `.mdt` file or JSON string, ' +
                    'optional `fontFiles` (repeatable). Form field `fonts` is a JSON array of `{ "family", "url" }`.',
                operationId: 'convertMultipart',
                security: [{ bearerAuth: [] }, { apiKeyHeader: [] }],
                requestBody: {
                    required: true,
                    content: {
                        'multipart/form-data': {
                            schema: {
                                type: 'object',
                                required: [],
                                properties: {
                                    markdown: {
                                        type: 'string',
                                        description:
                                            'Markdown source (required). The live API also accepts a **file** part named `markdown`; use curl or your app for file upload.',
                                    },
                                    template: {
                                        type: 'string',
                                        description:
                                            'Optional `.mdt` JSON as a string, or upload a file part named `template` (not shown as a separate field in all UIs).',
                                    },
                                    title: { type: 'string', example: 'My Report' },
                                    variables: {
                                        type: 'string',
                                        description: 'JSON object of placeholder values, e.g. `{"author":"Ada"}`',
                                        example: '{"author":"Ada Lovelace"}',
                                    },
                                    fonts: {
                                        type: 'string',
                                        description: 'JSON array of `{ "family": "Inter", "url": "https://..." }`',
                                        example: '[{"family":"Inter","url":"https://example.com/Inter.ttf"}]',
                                    },
                                    fontFiles: {
                                        type: 'string',
                                        format: 'binary',
                                        description: 'Optional font file (repeat field `fontFiles` for multiple).',
                                    },
                                    output: { type: 'string', enum: ['binary', 'base64'], default: 'binary' },
                                    debug: { type: 'string', enum: ['0', '1', 'true', 'false'], description: 'Include Typst source in base64 JSON response' },
                                    filename: { type: 'string', example: 'report.pdf' },
                                },
                            },
                        },
                    },
                },
                responses: {
                    '200': {
                        description: 'PDF bytes or JSON (base64)',
                        content: {
                            'application/pdf': { schema: { type: 'string', format: 'binary' } },
                            'application/json': { schema: { $ref: '#/components/schemas/ConvertBase64Response' } },
                        },
                    },
                    '400': { description: 'Bad request', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
                    '401': { description: 'Unauthorized', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
                    '500': { description: 'Conversion failed', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
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
                description: 'Send `Authorization: Bearer <API_KEY>` when the server has `API_KEY` set.',
            },
            apiKeyHeader: {
                type: 'apiKey',
                in: 'header',
                name: 'x-api-key',
                description: 'Alternative to Bearer: send the same secret in `x-api-key`.',
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
            FontUrl: {
                type: 'object',
                properties: {
                    family: { type: 'string', description: 'CSS font-family name used in template settings' },
                    url: { type: 'string', format: 'uri', description: 'HTTPS URL to a TTF, OTF, or WOFF file' },
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
                required: ['markdown'],
                properties: {
                    markdown: { type: 'string', description: 'Markdown document (YAML frontmatter allowed)' },
                    template: { $ref: '#/components/schemas/Template' },
                    title: { type: 'string', description: 'Document title for `{{title}}` placeholders' },
                    variables: {
                        type: 'object',
                        additionalProperties: { type: 'string' },
                        description: 'Values for `{{var:name}}`; overrides frontmatter `variables`',
                    },
                    fonts: {
                        type: 'array',
                        items: { $ref: '#/components/schemas/FontUrl' },
                        description: 'Remote fonts to load before compiling',
                    },
                    output: { type: 'string', enum: ['binary', 'base64'], default: 'binary' },
                    debug: { type: 'boolean', description: 'If true, include generated Typst source (base64 mode only)' },
                    filename: { type: 'string', description: 'Suggested download filename for binary PDF' },
                },
            },
            ConvertBase64Response: {
                type: 'object',
                properties: {
                    filename: { type: 'string' },
                    mimeType: { type: 'string', example: 'application/pdf' },
                    base64: { type: 'string', description: 'PDF bytes, base64-encoded' },
                    byteLength: { type: 'integer' },
                    typstSource: { type: 'string', description: 'Present when debug was enabled' },
                },
            },
        },
    },
} as const;

export type OpenApiDocument = typeof openApiDocument;
