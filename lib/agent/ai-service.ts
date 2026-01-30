/**
 * AI Service
 * Handles LLM API interactions for the AI agent (OpenAI, Anthropic, Google)
 */

export type LLMProvider = 'openai' | 'anthropic' | 'google';

import { agentLog } from './debug';
import { 
    AgentMessage, 
    DocumentDiff, 
    createMessage, 
    FileMention,
    generateId 
} from './types';
import { 
    readDocument, 
    readDocumentSection, 
    getDocumentMetadata, 
    searchInDocument, 
    searchAllDocuments,
    findHeadings,
    proposeEdit,
    proposeInsert,
    proposeDelete,
    proposeReplaceSection,
    proposeFullReplace,
} from './document-ops';
import { browserStorage } from '../browser-storage';
import {
    getTrialUserId,
    checkTrialLimit,
    addTrialTokenUsage,
    TRIAL_TOKEN_LIMIT,
} from './trial-usage';

// ==================== Types ====================

interface AIToolCall {
    id: string;
    name: string;
    arguments: Record<string, unknown>;
}

interface AIResponse {
    content: string;
    toolCalls?: AIToolCall[];
    diffs?: DocumentDiff[];
}

interface ChatMessage {
    role: 'system' | 'user' | 'assistant' | 'tool';
    content: string;
    tool_call_id?: string;
    tool_calls?: {
        id: string;
        type: 'function';
        function: {
            name: string;
            arguments: string;
        };
    }[];
}

// Read-only tools (no document editing)
const READ_ONLY_TOOL_NAMES = new Set([
    'read_document',
    'read_document_section',
    'get_document_metadata',
    'search_in_document',
    'search_all_documents',
    'find_headings',
    'list_files',
]);

// ==================== Tool Definitions ====================

const TOOLS = [
    {
        type: 'function' as const,
        function: {
            name: 'read_document',
            description: 'Read the full content of a markdown document',
            parameters: {
                type: 'object',
                properties: {
                    fileId: {
                        type: 'string',
                        description: 'The file path/ID of the document to read'
                    }
                },
                required: ['fileId']
            }
        }
    },
    {
        type: 'function' as const,
        function: {
            name: 'read_document_section',
            description: 'Read a specific section of a document by line numbers',
            parameters: {
                type: 'object',
                properties: {
                    fileId: {
                        type: 'string',
                        description: 'The file path/ID of the document'
                    },
                    startLine: {
                        type: 'number',
                        description: 'The starting line number (1-indexed)'
                    },
                    endLine: {
                        type: 'number',
                        description: 'The ending line number (1-indexed)'
                    }
                },
                required: ['fileId', 'startLine', 'endLine']
            }
        }
    },
    {
        type: 'function' as const,
        function: {
            name: 'get_document_metadata',
            description: 'Get metadata about a document including line count, word count, and headings',
            parameters: {
                type: 'object',
                properties: {
                    fileId: {
                        type: 'string',
                        description: 'The file path/ID of the document'
                    }
                },
                required: ['fileId']
            }
        }
    },
    {
        type: 'function' as const,
        function: {
            name: 'search_in_document',
            description: 'Search for text within a specific document',
            parameters: {
                type: 'object',
                properties: {
                    fileId: {
                        type: 'string',
                        description: 'The file path/ID of the document to search'
                    },
                    query: {
                        type: 'string',
                        description: 'The text to search for'
                    }
                },
                required: ['fileId', 'query']
            }
        }
    },
    {
        type: 'function' as const,
        function: {
            name: 'search_all_documents',
            description: 'Search for text across all documents',
            parameters: {
                type: 'object',
                properties: {
                    query: {
                        type: 'string',
                        description: 'The text to search for'
                    }
                },
                required: ['query']
            }
        }
    },
    {
        type: 'function' as const,
        function: {
            name: 'find_headings',
            description: 'Find all headings in a document (returns text and lineNumber for each). Use the exact "text" value when calling propose_replace_section.',
            parameters: {
                type: 'object',
                properties: {
                    fileId: {
                        type: 'string',
                        description: 'The file path/ID of the document'
                    },
                    level: {
                        type: 'number',
                        description: 'Optional: filter by heading level (1-6)'
                    }
                },
                required: ['fileId']
            }
        }
    },
    {
        type: 'function' as const,
        function: {
            name: 'propose_edit',
            description: 'Propose an edit by finding and replacing text in a document. The user will need to approve the change.',
            parameters: {
                type: 'object',
                properties: {
                    fileId: {
                        type: 'string',
                        description: 'The file path/ID of the document to edit'
                    },
                    oldText: {
                        type: 'string',
                        description: 'The exact text to find and replace'
                    },
                    newText: {
                        type: 'string',
                        description: 'The new text to replace with'
                    },
                    description: {
                        type: 'string',
                        description: 'A brief description of what this change does'
                    }
                },
                required: ['fileId', 'oldText', 'newText']
            }
        }
    },
    {
        type: 'function' as const,
        function: {
            name: 'propose_insert',
            description: 'Propose inserting new content at a specific position in the document',
            parameters: {
                type: 'object',
                properties: {
                    fileId: {
                        type: 'string',
                        description: 'The file path/ID of the document'
                    },
                    position: {
                        type: 'object',
                        description: 'Where to insert the content',
                        properties: {
                            type: {
                                type: 'string',
                                enum: ['line', 'afterHeading', 'start', 'end'],
                                description: 'Type of position'
                            },
                            lineNumber: {
                                type: 'number',
                                description: 'Line number (for type "line")'
                            },
                            headingText: {
                                type: 'string',
                                description: 'Heading text to insert after (for type "afterHeading")'
                            }
                        },
                        required: ['type']
                    },
                    content: {
                        type: 'string',
                        description: 'The content to insert'
                    },
                    description: {
                        type: 'string',
                        description: 'A brief description of what this change does'
                    }
                },
                required: ['fileId', 'position', 'content']
            }
        }
    },
    {
        type: 'function' as const,
        function: {
            name: 'propose_delete',
            description: 'Propose deleting lines from a document',
            parameters: {
                type: 'object',
                properties: {
                    fileId: {
                        type: 'string',
                        description: 'The file path/ID of the document'
                    },
                    startLine: {
                        type: 'number',
                        description: 'The starting line number to delete (1-indexed)'
                    },
                    endLine: {
                        type: 'number',
                        description: 'The ending line number to delete (1-indexed)'
                    },
                    description: {
                        type: 'string',
                        description: 'A brief description of what this change does'
                    }
                },
                required: ['fileId', 'startLine', 'endLine']
            }
        }
    },
    {
        type: 'function' as const,
        function: {
            name: 'propose_replace_section',
            description: 'Propose replacing an entire section (from heading to next heading of same/higher level). Use the exact heading text from find_headings (e.g. "6. Conclusion") for sectionHeading.',
            parameters: {
                type: 'object',
                properties: {
                    fileId: {
                        type: 'string',
                        description: 'The file path/ID of the document'
                    },
                    sectionHeading: {
                        type: 'string',
                        description: 'The heading text of the section to replace (use exact text from find_headings, e.g. "6. Conclusion")'
                    },
                    newContent: {
                        type: 'string',
                        description: 'The new content for the section (including the heading)'
                    },
                    description: {
                        type: 'string',
                        description: 'A brief description of what this change does'
                    }
                },
                required: ['fileId', 'sectionHeading', 'newContent']
            }
        }
    },
    {
        type: 'function' as const,
        function: {
            name: 'list_files',
            description: 'List all available files in the workspace',
            parameters: {
                type: 'object',
                properties: {},
                required: []
            }
        }
    }
];

// ==================== System Prompt ====================

const SYSTEM_PROMPT = `You are an AI assistant integrated into a markdown editor application. You help users read, search, and edit their markdown documents.

## Your Capabilities

You have access to tools that allow you to:
1. **Read documents** - Read full documents or specific sections
2. **Search** - Search within a document or across all documents
3. **Find headings** - Get document structure via headings
4. **Propose edits** - Suggest changes that the user can approve or reject

## Important Guidelines

1. **Always read before editing**: Before proposing any edit, first read the relevant document content to understand the current state.

2. **Be precise with edits**: When using propose_edit, the oldText must match EXACTLY what's in the document (including whitespace and newlines).

3. **Explain your changes**: Always provide a clear description of what each proposed change does.

4. **Use appropriate edit methods**:
   - Use \`propose_edit\` for replacing specific text
   - Use \`propose_insert\` for adding new content
   - Use \`propose_delete\` for removing content
   - Use \`propose_replace_section\` for replacing entire sections (pass the **exact** heading text from \`find_headings\` as \`sectionHeading\`, e.g. "6. Conclusion" not just "Conclusion")

5. **Finding sections**: Before replacing or editing a section, always call \`find_headings\` to get the exact heading text and structure. Use the \`text\` and \`lineNumber\` from the result. The \`sectionHeading\` in \`propose_replace_section\` must match a heading in the document (numbering like "6. Conclusion" is fine).

6. **File mentions**: When the user mentions a file with @filename, that file's content may be provided in context. Use this to understand what they're working on.

7. **Be helpful**: Offer suggestions for improving document structure, formatting, or content when appropriate.

8. **Markdown expertise**: You understand markdown syntax well. Help users with formatting, tables, code blocks, links, images, and other markdown features.

## Response Format

- **Format your final reply** with bullet points (each change or key point on its own line).
- Use **bold** for the most relevant parts: number of changes, main actions, file or section names (e.g. **3 changes** prepared, **expanded the introduction**).
- Be concise but helpful. When proposing edits, explain what you're changing and why.
- If you need to read a document first, do so before making suggestions.
- Use code blocks only when showing markdown examples.`;

// ==================== Tool Execution ====================

async function executeTool(name: string, args: Record<string, unknown>): Promise<string> {
    try {
        switch (name) {
            case 'read_document': {
                const content = await readDocument(args.fileId as string);
                return content || '(empty document)';
            }
            
            case 'read_document_section': {
                const content = await readDocumentSection(
                    args.fileId as string,
                    args.startLine as number,
                    args.endLine as number
                );
                return content || '(empty section)';
            }
            
            case 'get_document_metadata': {
                const metadata = await getDocumentMetadata(args.fileId as string);
                return JSON.stringify(metadata, null, 2);
            }
            
            case 'search_in_document': {
                const results = await searchInDocument(
                    args.fileId as string,
                    args.query as string
                );
                return JSON.stringify(results, null, 2);
            }
            
            case 'search_all_documents': {
                const results = await searchAllDocuments(args.query as string);
                return JSON.stringify(results, null, 2);
            }
            
            case 'find_headings': {
                const headings = await findHeadings(
                    args.fileId as string,
                    args.level as number | undefined
                );
                return JSON.stringify(headings, null, 2);
            }
            
            case 'propose_edit': {
                const diff = await proposeEdit(
                    args.fileId as string,
                    args.oldText as string,
                    args.newText as string,
                    args.description as string | undefined
                );
                if (!diff) {
                    return JSON.stringify({ error: 'Text not found in document' });
                }
                return JSON.stringify({ success: true, diffId: diff.id, diff });
            }
            
            case 'propose_insert': {
                const position = args.position as { type: string; lineNumber?: number; headingText?: string };
                let insertPos: import('./types').InsertPosition;
                
                switch (position.type) {
                    case 'start':
                        insertPos = { type: 'start' };
                        break;
                    case 'end':
                        insertPos = { type: 'end' };
                        break;
                    case 'line':
                        insertPos = { type: 'line', lineNumber: position.lineNumber! };
                        break;
                    case 'afterHeading':
                        insertPos = { type: 'afterHeading', headingText: position.headingText! };
                        break;
                    default:
                        return JSON.stringify({ error: 'Invalid position type' });
                }
                
                const diff = await proposeInsert(
                    args.fileId as string,
                    insertPos,
                    args.content as string,
                    args.description as string | undefined
                );
                if (!diff) {
                    return JSON.stringify({ error: 'Could not insert at specified position' });
                }
                return JSON.stringify({ success: true, diffId: diff.id, diff });
            }
            
            case 'propose_delete': {
                const diff = await proposeDelete(
                    args.fileId as string,
                    args.startLine as number,
                    args.endLine as number,
                    args.description as string | undefined
                );
                if (!diff) {
                    return JSON.stringify({ error: 'Invalid line range' });
                }
                return JSON.stringify({ success: true, diffId: diff.id, diff });
            }
            
            case 'propose_replace_section': {
                const diff = await proposeReplaceSection(
                    args.fileId as string,
                    args.sectionHeading as string,
                    args.newContent as string,
                    args.description as string | undefined
                );
                if (!diff) {
                    return JSON.stringify({ error: 'Section heading not found' });
                }
                return JSON.stringify({ success: true, diffId: diff.id, diff });
            }
            
            case 'list_files': {
                const { tree } = await browserStorage.list();
                const files: string[] = [];
                const collectFiles = (nodes: typeof tree, path = '') => {
                    for (const node of nodes) {
                        if (node.type === 'file') {
                            files.push(node.id);
                        } else if (node.children) {
                            collectFiles(node.children, node.id);
                        }
                    }
                };
                collectFiles(tree);
                return JSON.stringify({ files });
            }
            
            default:
                return JSON.stringify({ error: `Unknown tool: ${name}` });
        }
    } catch (error) {
        console.error(`Tool execution error (${name}):`, error);
        return JSON.stringify({ error: String(error) });
    }
}

// ==================== AI Service ====================

const PROVIDER_LABELS: Record<LLMProvider, string> = {
    openai: 'OpenAI',
    anthropic: 'Anthropic',
    google: 'Google',
};

const TRIAL_MODEL = 'gpt-4o-mini';

function getElectronEnv(key: string): string | undefined {
    if (typeof window !== 'undefined' && (window as unknown as { electronAPI?: { env?: Record<string, string> } }).electronAPI?.env?.[key]) {
        return (window as unknown as { electronAPI: { env: Record<string, string> } }).electronAPI.env[key];
    }
    return undefined;
}

function getMainOpenAIKey(): string {
    const key = typeof window !== 'undefined'
        ? (process.env.NEXT_PUBLIC_OPENAI_API_KEY ?? getElectronEnv('NEXT_PUBLIC_OPENAI_API_KEY'))
        : (process.env.OPENAI_API_KEY || process.env.NEXT_PUBLIC_OPENAI_API_KEY);
    return (key ?? '').trim();
}

function getTrialOpenAIKey(): string {
    const key = typeof window !== 'undefined'
        ? (process.env.NEXT_PUBLIC_TRIAL_OPENAI_API_KEY ?? getElectronEnv('NEXT_PUBLIC_TRIAL_OPENAI_API_KEY'))
        : (process.env.NEXT_PUBLIC_TRIAL_OPENAI_API_KEY ?? '');
    return (key ?? '').trim();
}

/**
 * Format API error for display: "Provider: short message"
 */
function formatProviderError(provider: LLMProvider, status: number, body: string): string {
    const label = PROVIDER_LABELS[provider];
    if (status === 401) return `${label}: Invalid API key`;
    if (status === 429) return `${label}: Rate limit exceeded`;
    if (status >= 500) return `${label}: Service error`;
    try {
        const j = JSON.parse(body) as { error?: { message?: string }; message?: string };
        const msg = j?.error?.message ?? j?.message;
        if (typeof msg === 'string' && msg.length > 0) {
            const short = msg.length > 100 ? msg.slice(0, 97) + '…' : msg;
            return `${label}: ${short}`;
        }
    } catch {
        // ignore parse errors
    }
    return `${label}: Request failed (${status})`;
}

/** Whether an API key for this provider is set in environment or trial (OpenAI only). */
export function hasEnvApiKey(provider: LLMProvider): boolean {
    if (provider === 'openai') {
        return getMainOpenAIKey().length > 0 || getTrialOpenAIKey().length > 0;
    }
    const keys: Record<LLMProvider, string> = {
        openai: '', // handled above
        anthropic: (typeof window !== 'undefined' ? process.env.NEXT_PUBLIC_ANTHROPIC_API_KEY : process.env.ANTHROPIC_API_KEY || process.env.NEXT_PUBLIC_ANTHROPIC_API_KEY) || '',
        google: (typeof window !== 'undefined' ? process.env.NEXT_PUBLIC_GOOGLE_AI_API_KEY : process.env.GOOGLE_AI_API_KEY || process.env.NEXT_PUBLIC_GOOGLE_AI_API_KEY) || '',
    };
    return (keys[provider] ?? '').trim().length > 0;
}

export function getApiKey(provider: LLMProvider, override?: string): string {
    if (override && override.trim()) return override.trim();
    if (provider === 'openai') {
        const main = getMainOpenAIKey();
        if (main) return main;
        const trial = getTrialOpenAIKey();
        if (trial) return trial;
        throw new Error('OpenAI: API key not configured. Add key in Settings → Agent or use free trial.');
    }
    const keys: Record<LLMProvider, string> = {
        openai: '', // handled above
        anthropic: (typeof window !== 'undefined' ? process.env.NEXT_PUBLIC_ANTHROPIC_API_KEY : process.env.ANTHROPIC_API_KEY || process.env.NEXT_PUBLIC_ANTHROPIC_API_KEY) || '',
        google: (typeof window !== 'undefined' ? process.env.NEXT_PUBLIC_GOOGLE_AI_API_KEY : process.env.GOOGLE_AI_API_KEY || process.env.NEXT_PUBLIC_GOOGLE_AI_API_KEY) || '',
    };
    const key = keys[provider];
    if (!key) {
        const label = PROVIDER_LABELS[provider];
        throw new Error(`${label}: API key not configured. Add key in Settings → Agent.`);
    }
    return key;
}

/** True when using the free trial OpenAI key (no user/settings key, fallback to trial). */
export function isTrialMode(provider: LLMProvider, apiKeyOverride?: string): boolean {
    if (provider !== 'openai') return false;
    if (apiKeyOverride && apiKeyOverride.trim()) return false;
    const main = getMainOpenAIKey();
    if (main) return false;
    const trial = getTrialOpenAIKey();
    return trial.length > 0;
}

/** Model to use in trial mode (GPT-4o mini only). */
export const TRIAL_MODEL_EXPORT = TRIAL_MODEL;

/** True when OpenAI is only available via trial key (no main env key, no user key in settings). */
export function isTrialOnlyOpenAI(userApiKeyOverride?: string): boolean {
    if (userApiKeyOverride && userApiKeyOverride.trim()) return false;
    if (getMainOpenAIKey().length > 0) return false;
    return getTrialOpenAIKey().length > 0;
}

function isTrialApiKey(apiKey: string): boolean {
    const trial = getTrialOpenAIKey();
    return trial.length > 0 && apiKey === trial;
}

async function assertTrialLimit(provider: LLMProvider, apiKey: string): Promise<void> {
    if (provider !== 'openai' || !isTrialApiKey(apiKey)) return;
    const userId = getTrialUserId();
    const { allowed, used, remaining } = checkTrialLimit(userId);
    if (!allowed) {
        throw new Error(
            `Free trial limit reached (${TRIAL_TOKEN_LIMIT.toLocaleString()} tokens). You've used ${used.toLocaleString()} tokens. Add your own API key in Settings → Agent to continue.`
        );
    }
}

function recordTrialUsage(provider: LLMProvider, apiKey: string, tokens: number): void {
    if (provider !== 'openai' || !isTrialApiKey(apiKey) || tokens <= 0) return;
    const userId = getTrialUserId();
    addTrialTokenUsage(userId, tokens);
}

/**
 * Validate an API key by making a minimal request. Returns true if key is valid.
 */
export async function validateApiKey(provider: LLMProvider, apiKey: string): Promise<boolean> {
    const key = apiKey?.trim();
    if (!key) return false;
    try {
        if (provider === 'openai') {
            const res = await fetch('https://api.openai.com/v1/models', {
                headers: { 'Authorization': `Bearer ${key}` },
            });
            return res.ok;
        }
        if (provider === 'google') {
            const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(key)}`);
            return res.ok;
        }
        if (provider === 'anthropic') {
            const res = await fetch('https://api.anthropic.com/v1/messages', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-api-key': key,
                    'anthropic-version': '2023-06-01',
                },
                body: JSON.stringify({
                    model: 'claude-3-haiku-20240307',
                    max_tokens: 1,
                    messages: [{ role: 'user', content: 'x' }],
                }),
            });
            return res.ok;
        }
    } catch {
        return false;
    }
    return false;
}

/** Derive provider from model id (e.g. gpt-4o -> openai, claude-* -> anthropic, gemini-* -> google). */
export function modelToProvider(model: string): LLMProvider {
    if (!model) return 'openai';
    if (model.startsWith('claude-')) return 'anthropic';
    if (model.startsWith('gemini-')) return 'google';
    return 'openai';
}

// ==================== Shared LLM client (one round) for orchestration ====================

export interface ChatCompletionMessage {
    role: 'system' | 'user' | 'assistant' | 'tool';
    content: string;
    tool_call_id?: string;
    tool_calls?: Array<{ id: string; function: { name: string; arguments: string } }>;
}

export interface ChatCompletionTool {
    type: 'function';
    function: { name: string; description?: string; parameters: Record<string, unknown> };
}

export interface ChatCompletionOneRoundOptions {
    provider: LLMProvider;
    apiKey: string;
    model: string;
    messages: ChatCompletionMessage[];
    tools?: ChatCompletionTool[];
    temperature?: number;
    maxTokens?: number;
}

export interface ChatCompletionOneRoundResult {
    content: string;
    tool_calls?: Array<{ id: string; function: { name: string; arguments: string } }>;
}

/**
 * One round of chat completion with optional tools. Used by orchestration agents.
 */
export async function chatCompletionOneRound(options: ChatCompletionOneRoundOptions): Promise<ChatCompletionOneRoundResult> {
    const { provider, apiKey, model, messages, tools = [], temperature = 0.7, maxTokens = 4096 } = options;
    const useOpenAIFormat = provider === 'openai' || provider === 'google';
    const effectiveModel = provider === 'openai' && isTrialApiKey(apiKey) ? TRIAL_MODEL : model;
    const url = provider === 'google'
        ? 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions'
        : 'https://api.openai.com/v1/chat/completions';

    await assertTrialLimit(provider, apiKey);

    if (useOpenAIFormat) {
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
            body: JSON.stringify({
                model: effectiveModel,
                messages,
                tools: tools.length ? tools : undefined,
                tool_choice: tools.length ? 'auto' : undefined,
                temperature,
                max_tokens: maxTokens,
            }),
        });
        if (!response.ok) {
            const err = await response.text();
            throw new Error(formatProviderError(provider, response.status, err));
        }
        const data = await response.json();
        const msg = data.choices?.[0]?.message;
        if (!msg) throw new Error(`${PROVIDER_LABELS[provider]}: No response from API`);
        const usage = data.usage as { total_tokens?: number; prompt_tokens?: number; completion_tokens?: number } | undefined;
        const tokens = usage?.total_tokens ?? (usage && typeof usage.prompt_tokens === 'number' && typeof usage.completion_tokens === 'number' ? usage.prompt_tokens + usage.completion_tokens : 0);
        recordTrialUsage(provider, apiKey, tokens);
        return {
            content: msg.content ?? '',
            tool_calls: msg.tool_calls,
        };
    }

    // Anthropic
    const anthropicTools = tools.map((t) => ({
        name: t.function.name,
        description: (t.function as { description?: string }).description ?? '',
        input_schema: t.function.parameters as Record<string, unknown>,
    }));
    const anthropicMessages: Array<{ role: 'user' | 'assistant'; content: string | Array<{ type: string; id?: string; name?: string; input?: unknown; tool_use_id?: string; content?: string }> }> = [];
    const systemParts: string[] = [];
    for (const m of messages) {
        if (m.role === 'system') {
            systemParts.push(m.content);
            continue;
        }
        if (m.role === 'user') {
            anthropicMessages.push({ role: 'user', content: m.content });
        } else if (m.role === 'assistant') {
            if (m.tool_calls?.length) {
                anthropicMessages.push({
                    role: 'assistant',
                    content: m.tool_calls.map((tc) => ({
                        type: 'tool_use' as const,
                        id: tc.id,
                        name: tc.function.name,
                        input: JSON.parse(tc.function.arguments) as Record<string, unknown>,
                    })),
                });
            } else {
                anthropicMessages.push({ role: 'assistant', content: m.content || '' });
            }
        } else if (m.role === 'tool') {
            anthropicMessages.push({
                role: 'user',
                content: [{ type: 'tool_result' as const, tool_use_id: m.tool_call_id!, content: m.content }],
            });
        }
    }
    const systemPrompt = systemParts.join('\n\n');
    const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'x-api-key': apiKey,
            'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
            model,
            max_tokens: maxTokens,
            system: systemPrompt,
            messages: anthropicMessages,
            tools: anthropicTools.length ? anthropicTools : undefined,
            tool_choice: anthropicTools.length ? { type: 'auto' as const } : undefined,
        }),
    });
    if (!response.ok) {
        const err = await response.text();
        throw new Error(formatProviderError('anthropic', response.status, err));
    }
    const data = await response.json();
    const blocks = data.content ?? [];
    const textParts: string[] = [];
    const toolCalls: Array<{ id: string; function: { name: string; arguments: string } }> = [];
    for (const block of blocks) {
        if (block.type === 'text') textParts.push(block.text ?? '');
        else if (block.type === 'tool_use')
            toolCalls.push({
                id: block.id,
                function: { name: block.name, arguments: JSON.stringify(block.input ?? {}) },
            });
    }
    return { content: textParts.join('').trim(), tool_calls: toolCalls.length ? toolCalls : undefined };
}

/**
 * Simple chat completion (no tools). Used by summarizer agent.
 */
export async function chatCompletion(options: {
    provider: LLMProvider;
    apiKey: string;
    model: string;
    messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>;
    temperature?: number;
    maxTokens?: number;
}): Promise<string> {
    const { provider, apiKey, model, messages, temperature = 0.7, maxTokens = 4096 } = options;
    const useOpenAIFormat = provider === 'openai' || provider === 'google';
    const effectiveModel = provider === 'openai' && isTrialApiKey(apiKey) ? TRIAL_MODEL : model;
    const url = provider === 'google'
        ? 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions'
        : 'https://api.openai.com/v1/chat/completions';

    await assertTrialLimit(provider, apiKey);

    if (useOpenAIFormat) {
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
            body: JSON.stringify({ model: effectiveModel, messages, temperature, max_tokens: maxTokens }),
        });
        if (!response.ok) {
            const err = await response.text();
            throw new Error(formatProviderError(provider, response.status, err));
        }
        const data = await response.json();
        const usage = data.usage as { total_tokens?: number; prompt_tokens?: number; completion_tokens?: number } | undefined;
        const tokens = usage?.total_tokens ?? (usage && typeof usage.prompt_tokens === 'number' && typeof usage.completion_tokens === 'number' ? usage.prompt_tokens + usage.completion_tokens : 0);
        recordTrialUsage(provider, apiKey, tokens);
        return data.choices?.[0]?.message?.content?.trim() ?? '';
    }

    const systemParts: string[] = [];
    const anthropicMessages: Array<{ role: 'user' | 'assistant'; content: string }> = [];
    for (const m of messages) {
        if (m.role === 'system') systemParts.push(m.content);
        else anthropicMessages.push({ role: m.role as 'user' | 'assistant', content: m.content });
    }
    const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({
            model,
            max_tokens: maxTokens,
            system: systemParts.join('\n\n'),
            messages: anthropicMessages,
        }),
    });
    if (!response.ok) {
        const err = await response.text();
        throw new Error(formatProviderError('anthropic', response.status, err));
    }
    const data = await response.json();
    const blocks = data.content ?? [];
    const text = blocks.filter((b: { type: string }) => b.type === 'text').map((b: { text?: string }) => b.text ?? '').join('').trim();
    return text || '';
}

export interface SendMessageToAIOptions {
    provider?: LLMProvider;
    model?: string;
    readOnly?: boolean;
    apiKeyOverride?: string;
    temperature?: number;
    maxTokens?: number;
    onDiffCreated?: (diff: DocumentDiff) => void;
}

export async function sendMessageToAI(
    messages: AgentMessage[],
    mentionedFiles: string[],
    onDiffCreated?: (diff: DocumentDiff) => void,
    options?: SendMessageToAIOptions
): Promise<AIResponse> {
    const provider = options?.provider ?? 'openai';
    const apiKey = getApiKey(provider, options?.apiKeyOverride);
    const baseModel = options?.model ?? (provider === 'openai' ? 'gpt-4o' : provider === 'anthropic' ? 'claude-sonnet-4-20250514' : 'gemini-1.5-flash');
    const model = provider === 'openai' && isTrialApiKey(apiKey) ? TRIAL_MODEL : baseModel;

    await assertTrialLimit(provider, apiKey);
    const readOnly = options?.readOnly ?? false;
    const temperature = options?.temperature ?? 0.7;
    const maxTokens = options?.maxTokens ?? 4096;
    const onDiff = options?.onDiffCreated ?? onDiffCreated;

    agentLog.info('sendMessageToAI (single-agent)', { provider, model, readOnly, messageCount: messages.length, mentionedFiles: mentionedFiles.length });

    // In read-only mode, only expose read tools
    const tools = readOnly
        ? TOOLS.filter((t) => READ_ONLY_TOOL_NAMES.has(t.function.name))
        : TOOLS;

    const systemPrompt = readOnly
        ? SYSTEM_PROMPT + '\n\n**Read-only mode is enabled.** You must NOT use any tools that propose or apply edits to documents. Only read, search, and list. If the user asks to edit, explain that edit mode is disabled.'
        : SYSTEM_PROMPT;

    // Build context from mentioned files
    let fileContext = '';
    if (mentionedFiles.length > 0) {
        for (const fileId of mentionedFiles) {
            try {
                const content = await readDocument(fileId);
                const fileName = fileId.split('/').pop() || fileId;
                fileContext += `\n\n--- Content of @${fileName} (${fileId}) ---\n${content}\n--- End of ${fileName} ---`;
            } catch (error) {
                console.error(`Failed to read mentioned file ${fileId}:`, error);
            }
        }
    }
    
    // Convert AgentMessages to ChatMessages
    const chatMessages: ChatMessage[] = [
        { role: 'system', content: systemPrompt }
    ];
    
    // Add file context to the first user message if available
    for (let i = 0; i < messages.length; i++) {
        const msg = messages[i];
        if (msg.role === 'user' || msg.role === 'assistant') {
            let content = msg.content;
            
            // Add file context to first user message
            if (i === 0 && msg.role === 'user' && fileContext) {
                content = `${content}\n\n[Referenced files]:${fileContext}`;
            }
            
            chatMessages.push({
                role: msg.role,
                content
            });
        }
    }
    
    // Make API call with tools (provider-specific)
    const collectedDiffs: DocumentDiff[] = [];
    let maxIterations = 10; // Prevent infinite loops

    const openaiCompatibleUrl = provider === 'google'
        ? 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions'
        : 'https://api.openai.com/v1/chat/completions';

    const useOpenAIFormat = provider === 'openai' || provider === 'google';
    type MessageWithTools = { content?: string; tool_calls?: Array<{ id: string; function: { name: string; arguments: string } }> };
    
    while (maxIterations > 0) {
        maxIterations--;
        let message: MessageWithTools;
        
        if (useOpenAIFormat) {
            // OpenAI and Google (OpenAI-compatible) use same request shape
            const response = await fetch(openaiCompatibleUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${apiKey}`
                },
                body: JSON.stringify({
                    model,
                    messages: chatMessages,
                    tools,
                    tool_choice: tools.length > 0 ? 'auto' : undefined,
                    temperature,
                    max_tokens: maxTokens
                })
            });
            
            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(formatProviderError(provider, response.status, errorText));
            }
            
            const data = await response.json();
            const choice = data.choices?.[0];
            const msg = choice?.message;
            if (!msg) {
                throw new Error(`${PROVIDER_LABELS[provider]}: No response from API`);
            }
            const usage = data.usage as { total_tokens?: number; prompt_tokens?: number; completion_tokens?: number } | undefined;
            const tokens = usage?.total_tokens ?? (usage && typeof usage.prompt_tokens === 'number' && typeof usage.completion_tokens === 'number' ? usage.prompt_tokens + usage.completion_tokens : 0);
            recordTrialUsage(provider, apiKey, tokens);
            message = msg;
        } else {
            // Anthropic Messages API
            const anthropicTools = tools.map((t) => ({
                name: t.function.name,
                description: (t.function as { description?: string }).description ?? '',
                input_schema: t.function.parameters as Record<string, unknown>,
            }));
            const anthropicMessages: Array<{ role: 'user' | 'assistant'; content: string | Array<{ type: string; id?: string; name?: string; input?: unknown; tool_use_id?: string; content?: string }> }> = [];
            for (let i = 1; i < chatMessages.length; i++) {
                const m = chatMessages[i];
                if (m.role === 'user') {
                    anthropicMessages.push({ role: 'user', content: m.content as string });
                } else if (m.role === 'assistant') {
                    if ((m as { tool_calls?: unknown[] }).tool_calls?.length) {
                        const blocks = (m as { tool_calls: Array<{ id: string; function: { name: string; arguments: string } }> }).tool_calls.map((tc) => ({
                            type: 'tool_use' as const,
                            id: tc.id,
                            name: tc.function.name,
                            input: JSON.parse(tc.function.arguments) as Record<string, unknown>,
                        }));
                        anthropicMessages.push({ role: 'assistant', content: blocks });
                    } else {
                        anthropicMessages.push({ role: 'assistant', content: (m.content as string) || '' });
                    }
                } else if (m.role === 'tool') {
                    const toolResults: Array<{ type: 'tool_result'; tool_use_id: string; content: string }> = [];
                    let j = i;
                    while (j < chatMessages.length && (chatMessages[j] as { role: string }).role === 'tool') {
                        const tm = chatMessages[j] as { tool_call_id: string; content: string };
                        toolResults.push({ type: 'tool_result', tool_use_id: tm.tool_call_id, content: tm.content });
                        j++;
                    }
                    anthropicMessages.push({ role: 'user', content: toolResults });
                    i = j - 1;
                }
            }
            const response = await fetch('https://api.anthropic.com/v1/messages', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-api-key': apiKey,
                    'anthropic-version': '2023-06-01',
                },
                body: JSON.stringify({
                    model,
                    max_tokens: maxTokens,
                    system: systemPrompt,
                    messages: anthropicMessages,
                    tools: anthropicTools.length ? anthropicTools : undefined,
                    tool_choice: anthropicTools.length ? { type: 'auto' as const } : undefined,
                }),
            });
            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(formatProviderError('anthropic', response.status, errorText));
            }
            const data = await response.json();
            const contentBlocks = data.content ?? [];
            const textParts: string[] = [];
            const toolCalls: Array<{ id: string; function: { name: string; arguments: string } }> = [];
            for (const block of contentBlocks) {
                if (block.type === 'text') {
                    textParts.push(block.text ?? '');
                } else if (block.type === 'tool_use') {
                    toolCalls.push({
                        id: block.id,
                        function: {
                            name: block.name,
                            arguments: JSON.stringify(block.input ?? {}),
                        },
                    });
                }
            }
            message = {
                content: textParts.join('').trim() || undefined,
                tool_calls: toolCalls.length ? toolCalls : undefined,
            };
        }
        
        // Check if there are tool calls
        if (message.tool_calls && message.tool_calls.length > 0) {
            agentLog.step('tool_calls', message.tool_calls.length, message.tool_calls.map((t: { function: { name: string } }) => t.function.name));
            // Add assistant message with tool calls (ChatMessage requires type: 'function' on each)
            chatMessages.push({
                role: 'assistant',
                content: message.content || '',
                tool_calls: message.tool_calls.map((tc) => ({
                    id: tc.id,
                    type: 'function' as const,
                    function: tc.function
                }))
            });
            
            // Execute each tool call
            for (const toolCall of message.tool_calls) {
                const args = JSON.parse(toolCall.function.arguments);
                agentLog.tool(toolCall.function.name, args);
                const result = await executeTool(toolCall.function.name, args);
                
                // Check if this was an edit operation that created a diff
                if (toolCall.function.name.startsWith('propose_')) {
                    try {
                        const resultObj = JSON.parse(result);
                        if (resultObj.success && resultObj.diff) {
                            collectedDiffs.push(resultObj.diff);
                            if (onDiff) {
                                onDiff(resultObj.diff);
                            }
                        }
                    } catch {
                        // Not a JSON response or no diff
                    }
                }
                
                // Add tool result
                chatMessages.push({
                    role: 'tool',
                    tool_call_id: toolCall.id,
                    content: result
                });
            }
            
            // Continue the loop to get the next response
            continue;
        }
        
        // No more tool calls, return the final response
        agentLog.info('sendMessageToAI done', { diffs: collectedDiffs.length });
        return {
            content: message.content || '',
            diffs: collectedDiffs.length > 0 ? collectedDiffs : undefined
        };
    }
    
    agentLog.warn('sendMessageToAI max iterations reached');
    // If we hit max iterations, return what we have
    return {
        content: 'I apologize, but I encountered an issue processing your request. Please try again.',
        diffs: collectedDiffs.length > 0 ? collectedDiffs : undefined
    };
}

// ==================== Streaming Version (for future use) ====================

export async function* streamMessageToAI(
    messages: AgentMessage[],
    mentionedFiles: string[],
    onDiffCreated?: (diff: DocumentDiff) => void
): AsyncGenerator<string, AIResponse, unknown> {
    // For now, just use the non-streaming version
    // In the future, we can implement proper streaming
    const response = await sendMessageToAI(messages, mentionedFiles, onDiffCreated);
    yield response.content;
    return response;
}
