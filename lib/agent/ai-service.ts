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
    generateId,
    type ImageAttachment,
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
    getDocumentStructure,
    proposeUpdateSection,
    proposeAddSection,
    proposeRemoveSection,
    proposeMoveSection,
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

type VisionContentPart =
    | { type: 'text'; text: string }
    | { type: 'image_url'; image_url: { url: string } };

interface ChatMessage {
    role: 'system' | 'user' | 'assistant' | 'tool';
    content: string | VisionContentPart[];
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
    'get_document_structure',
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
            description: 'Propose replacing an entire section (from heading to next heading of same/higher level). Use the exact heading text from find_headings for sectionHeading (no numbering on headings).',
            parameters: {
                type: 'object',
                properties: {
                    fileId: {
                        type: 'string',
                        description: 'The file path/ID of the document'
                    },
                    sectionHeading: {
                        type: 'string',
                        description: 'The heading text of the section to replace (use exact text from find_headings; headings in this editor have no numbering, e.g. "Conclusion")'
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
            name: 'get_document_structure',
            description: 'Get the hierarchical structure of headings in the document. Returns a tree of sections.',
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
            name: 'update_section',
            description: 'Update the content of a specific section. Replaces everything from the section heading to the next heading.',
            parameters: {
                type: 'object',
                properties: {
                    fileId: { type: 'string' },
                    sectionHeading: { type: 'string', description: 'Exact text of the heading to update' },
                    newContent: { type: 'string', description: 'New content for the section (including the heading)' },
                    description: { type: 'string', description: 'Reason for the change' }
                },
                required: ['fileId', 'sectionHeading', 'newContent']
            }
        }
    },
    {
        type: 'function' as const,
        function: {
            name: 'add_section',
            description: 'Add a new section relative to an existing heading.',
            parameters: {
                type: 'object',
                properties: {
                    fileId: { type: 'string' },
                    targetHeading: { type: 'string', description: 'Existing heading to position relative to' },
                    relation: { type: 'string', enum: ['before', 'after'], description: 'Place new section before or after target' },
                    newContent: { type: 'string', description: 'Content of the new section (including heading)' },
                    description: { type: 'string' }
                },
                required: ['fileId', 'targetHeading', 'relation', 'newContent']
            }
        }
    },
    {
        type: 'function' as const,
        function: {
            name: 'remove_section',
            description: 'Remove an entire section (heading and body). When the same heading appears multiple times, use occurrenceIndex (1 = first, 2 = second) to remove the duplicate.',
            parameters: {
                type: 'object',
                properties: {
                    fileId: { type: 'string' },
                    sectionHeading: { type: 'string', description: 'Exact text of the heading to remove' },
                    occurrenceIndex: { type: 'number', description: 'Which occurrence to remove when heading appears multiple times (1-based). Default 1.' },
                    description: { type: 'string' }
                },
                required: ['fileId', 'sectionHeading']
            }
        }
    },
    {
        type: 'function' as const,
        function: {
            name: 'move_section',
            description: 'Move a section to a new location relative to another section.',
            parameters: {
                type: 'object',
                properties: {
                    fileId: { type: 'string' },
                    sectionHeading: { type: 'string', description: 'Heading of the section to move' },
                    targetHeading: { type: 'string', description: 'Heading to move relative to' },
                    relation: { type: 'string', enum: ['before', 'after'] },
                    description: { type: 'string' }
                },
                required: ['fileId', 'sectionHeading', 'targetHeading', 'relation']
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

const SYSTEM_PROMPT = `You are an AI assistant integrated into a modern markdown editor. You help users organize, write, and refine their documents.

## Core Philosophy
You operate like a smart editor or "Canvas" assistant. Instead of just appending text, you understand the **structure** of the document (headings, sections, hierarchy). When requested to change something, you should:
1. **Analyze Structure**: Use \`get_document_structure\` first to understand the outline.
2. **Target Sections**: Use structureal tools like \`update_section\`, \`add_section\`, \`move_section\` whenever possible, rather than raw line edits.
3. **Prevent Duplication**: By targeting specific sections by name, you ensure you replace old versions instead of appending new ones.

## Your Capabilities
You have access to tools that allow you to:
1. **Read & Analyze**: \`read_document\`, \`get_document_structure\` (Get tree view of sections), \`search_in_document\`.
2. **Structural Editing** (Preferred):
   - \`update_section\`: Rewrite a specific section.
   - \`add_section\`: Insert a new section relative to another.
   - \`remove_section\`: Delete a section.
   - \`move_section\`: Reorder sections.
3. **Fine-grained Editing**:
   - \`propose_edit\`: Find & replace text (use sparingly for typos).
   - \`propose_insert\`: Insert at line number (use only if structural tools don't fit).

## Important Guidelines
1. **Always read structure**: Before making significant changes, call \`get_document_structure\` to see the current headings.
2. **Avoid Raw Line Numbers**: Line numbers change. Headings are more stable anchors. Use section tools.
3. **Rewriting Sections**: When asked to "rewrite introduction", use \`update_section(..., "Introduction", "## Introduction\nNew content...")\`. Include the heading in the new content!
4. **No Duplication**: If adding a "Conclusion", check if one exists. If yes, use \`update_section\`. If no, use \`add_section\`.

## Markdown Formatting
- **Headings**: Use \`## Title\` format. Do not use numbered lists for headings (e.g. no \`## 1. Title\`) unless the user explicitly asks for it.
- **Math**: \`$$ ... $$\` for blocks, \`$...$\` for inline. Block equations (\`$$...$$\`) must have an empty line before and after.
- **Alerts**: \`> [!NOTE]\` syntax.

## Response Format
- **Format your final reply** with bullet points summarizing changes.
- **Bold** key actions (e.g. **Updated Introduction**, **Added Conclusion**).
- Be concise.`;

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

            case 'get_document_structure': {
                const structure = await getDocumentStructure(args.fileId as string);
                return JSON.stringify(structure, null, 2);
            }

            case 'update_section': {
                const diff = await proposeUpdateSection(
                    args.fileId as string,
                    args.sectionHeading as string,
                    args.newContent as string,
                    args.description as string | undefined
                );
                if (!diff) return JSON.stringify({ error: 'Section not found' });
                return JSON.stringify({ success: true, diffId: diff.id, diff });
            }

            case 'add_section': {
                const diff = await proposeAddSection(
                    args.fileId as string,
                    args.targetHeading as string,
                    args.relation as 'before' | 'after',
                    args.newContent as string,
                    args.description as string | undefined
                );
                if (!diff) return JSON.stringify({ error: 'Target section not found' });
                return JSON.stringify({ success: true, diffId: diff.id, diff });
            }

            case 'remove_section': {
                const occurrenceIndex = (args.occurrenceIndex as number) ?? 1;
                const diff = await proposeRemoveSection(
                    args.fileId as string,
                    args.sectionHeading as string,
                    args.description as string | undefined,
                    occurrenceIndex
                );
                if (!diff) return JSON.stringify({ error: 'Section not found' });
                return JSON.stringify({ success: true, diffId: diff.id, diff });
            }

            case 'move_section': {
                const diff = await proposeMoveSection(
                    args.fileId as string,
                    args.sectionHeading as string,
                    args.targetHeading as string,
                    args.relation as 'before' | 'after',
                    args.description as string | undefined
                );
                if (!diff) return JSON.stringify({ error: 'Section or target not found, or invalid move' });
                return JSON.stringify({ success: true, diffId: diff.id, diff });
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

const TRIAL_MODEL = 'gpt-4o';

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
        ? (process.env.TRIAL_OPENAI_API_KEY ?? getElectronEnv('TRIAL_OPENAI_API_KEY'))
        : (process.env.TRIAL_OPENAI_API_KEY ?? '');
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

export type VisionContentPartForChat =
    | { type: 'text'; text: string }
    | { type: 'image_url'; image_url: { url: string } };

export interface ChatCompletionMessage {
    role: 'system' | 'user' | 'assistant' | 'tool';
    content: string | VisionContentPartForChat[];
    tool_call_id?: string;
    tool_calls?: Array<{ id: string; function: { name: string; arguments: string } }>;
}

/**
 * Build user message content for vision: text only, or text + image parts for orchestration agents.
 */
export function buildVisionUserContent(text: string, imageAttachments?: ImageAttachment[]): string | VisionContentPartForChat[] {
    if (!imageAttachments?.length) return text;
    const parts: VisionContentPartForChat[] = [{ type: 'text', text }];
    for (const img of imageAttachments) {
        const dataUrl = img.base64.startsWith('data:') ? img.base64 : `data:${img.mimeType};base64,${img.base64}`;
        parts.push({ type: 'image_url', image_url: { url: dataUrl } });
    }
    return parts;
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
 * Helper to check if error is retryable
 */
function isRetryableError(error: unknown): boolean {
    const errorMsg = error instanceof Error ? error.message : String(error);
    const retryablePatterns = [
        'Failed to fetch',
        'Network request failed',
        'ECONNREFUSED',
        'ETIMEDOUT',
        'ENOTFOUND',
        'ECONNRESET',
        'NetworkError',
        'fetch failed',
    ];
    return retryablePatterns.some(pattern => errorMsg.toLowerCase().includes(pattern.toLowerCase()));
}

/**
 * Helper to check if HTTP status is retryable
 */
function isRetryableStatus(status: number): boolean {
    return status === 429 || status === 500 || status === 502 || status === 503 || status === 504;
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
        let lastError: Error | null = null;
        for (let attempt = 0; attempt < 3; attempt++) {
            try {
                if (attempt > 0) {
                    const delay = Math.min(1000 * Math.pow(2, attempt - 1), 5000);
                    await new Promise(resolve => setTimeout(resolve, delay));
                }

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
                    const error = new Error(formatProviderError(provider, response.status, err));
                    if (!isRetryableStatus(response.status) || attempt === 2) {
                        throw error;
                    }
                    lastError = error;
                    continue;
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
            } catch (error) {
                lastError = error instanceof Error ? error : new Error(String(error));
                if (!isRetryableError(error) || attempt === 2) {
                    throw lastError;
                }
            }
        }
        throw lastError || new Error(`${PROVIDER_LABELS[provider]}: Request failed`);
    }

    // Anthropic
    const anthropicTools = tools.map((t) => ({
        name: t.function.name,
        description: (t.function as { description?: string }).description ?? '',
        input_schema: t.function.parameters as Record<string, unknown>,
    }));
    type AnthropicUserContent = string | Array<{ type: 'text'; text: string } | { type: 'image'; source: { type: 'base64'; media_type: string; data: string } }>;
    const anthropicMessages: Array<{ role: 'user' | 'assistant'; content: AnthropicUserContent | Array<{ type: string; id?: string; name?: string; input?: unknown; tool_use_id?: string; content?: string }> }> = [];
    const systemParts: string[] = [];
    for (const m of messages) {
        if (m.role === 'system') {
            systemParts.push(typeof m.content === 'string' ? m.content : m.content.map(p => p.type === 'text' ? p.text : '').join(''));
            continue;
        }
        if (m.role === 'user') {
            const content = m.content;
            if (Array.isArray(content)) {
                const blocks: AnthropicUserContent = content.map((part) => {
                    if (part.type === 'text') return { type: 'text' as const, text: part.text };
                    const url = part.image_url.url;
                    const match = url.match(/^data:image\/([^;]+);base64,(.+)$/);
                    const mediaType = match ? `image/${match[1]}` : 'image/png';
                    const data = match ? match[2] : url.replace(/^data:[^;]+;base64,/, '');
                    return { type: 'image' as const, source: { type: 'base64' as const, media_type: mediaType, data } };
                });
                anthropicMessages.push({ role: 'user', content: blocks });
            } else {
                anthropicMessages.push({ role: 'user', content });
            }
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
                const text = typeof m.content === 'string' ? m.content : '';
                anthropicMessages.push({ role: 'assistant', content: text || '' });
            }
        } else if (m.role === 'tool') {
            const toolContent = typeof m.content === 'string' ? m.content : '';
            anthropicMessages.push({
                role: 'user',
                content: [{ type: 'tool_result' as const, tool_use_id: m.tool_call_id!, content: toolContent }],
            });
        }
    }
    const systemPrompt = systemParts.join('\n\n');

    let lastError: Error | null = null;
    for (let attempt = 0; attempt < 3; attempt++) {
        try {
            if (attempt > 0) {
                const delay = Math.min(1000 * Math.pow(2, attempt - 1), 5000);
                await new Promise(resolve => setTimeout(resolve, delay));
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
                const err = await response.text();
                const error = new Error(formatProviderError('anthropic', response.status, err));
                if (!isRetryableStatus(response.status) || attempt === 2) {
                    throw error;
                }
                lastError = error;
                continue;
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
        } catch (error) {
            lastError = error instanceof Error ? error : new Error(String(error));
            if (!isRetryableError(error) || attempt === 2) {
                throw lastError;
            }
        }
    }
    throw lastError || new Error(`${PROVIDER_LABELS['anthropic']}: Request failed`);
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
        let lastError: Error | null = null;
        for (let attempt = 0; attempt < 3; attempt++) {
            try {
                if (attempt > 0) {
                    const delay = Math.min(1000 * Math.pow(2, attempt - 1), 5000);
                    await new Promise(resolve => setTimeout(resolve, delay));
                }

                const response = await fetch(url, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
                    body: JSON.stringify({ model: effectiveModel, messages, temperature, max_tokens: maxTokens }),
                });
                if (!response.ok) {
                    const err = await response.text();
                    const error = new Error(formatProviderError(provider, response.status, err));
                    if (!isRetryableStatus(response.status) || attempt === 2) {
                        throw error;
                    }
                    lastError = error;
                    continue;
                }
                const data = await response.json();
                const usage = data.usage as { total_tokens?: number; prompt_tokens?: number; completion_tokens?: number } | undefined;
                const tokens = usage?.total_tokens ?? (usage && typeof usage.prompt_tokens === 'number' && typeof usage.completion_tokens === 'number' ? usage.prompt_tokens + usage.completion_tokens : 0);
                recordTrialUsage(provider, apiKey, tokens);
                return data.choices?.[0]?.message?.content?.trim() ?? '';
            } catch (error) {
                lastError = error instanceof Error ? error : new Error(String(error));
                if (!isRetryableError(error) || attempt === 2) {
                    throw lastError;
                }
            }
        }
        throw lastError || new Error(`${PROVIDER_LABELS[provider]}: Request failed`);
    }

    const systemParts: string[] = [];
    const anthropicMessages: Array<{ role: 'user' | 'assistant'; content: string }> = [];
    for (const m of messages) {
        if (m.role === 'system') systemParts.push(m.content);
        else anthropicMessages.push({ role: m.role as 'user' | 'assistant', content: m.content });
    }

    let lastError: Error | null = null;
    for (let attempt = 0; attempt < 3; attempt++) {
        try {
            if (attempt > 0) {
                const delay = Math.min(1000 * Math.pow(2, attempt - 1), 5000);
                await new Promise(resolve => setTimeout(resolve, delay));
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
                const error = new Error(formatProviderError('anthropic', response.status, err));
                if (!isRetryableStatus(response.status) || attempt === 2) {
                    throw error;
                }
                lastError = error;
                continue;
            }
            const data = await response.json();
            const blocks = data.content ?? [];
            const text = blocks.filter((b: { type: string }) => b.type === 'text').map((b: { text?: string }) => b.text ?? '').join('').trim();
            return text || '';
        } catch (error) {
            lastError = error instanceof Error ? error : new Error(String(error));
            if (!isRetryableError(error) || attempt === 2) {
                throw lastError;
            }
        }
    }
    throw lastError || new Error(`${PROVIDER_LABELS['anthropic']}: Request failed`);
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

    // Add file context and image attachments to the first user message if available
    for (let i = 0; i < messages.length; i++) {
        const msg = messages[i];
        if (msg.role === 'user' || msg.role === 'assistant') {
            let content = msg.fullContent || msg.content;

            // Add file context to first user message
            if (i === 0 && msg.role === 'user' && fileContext) {
                content = `${content}\n\n[Referenced files]:${fileContext}`;
            }

            // Build vision multipart content for first user message with image attachments
            const imageAttachments = msg.role === 'user' && i === 0 ? (msg as AgentMessage).imageAttachments : undefined;
            if (imageAttachments && imageAttachments.length > 0) {
                const parts: VisionContentPart[] = [{ type: 'text', text: content }];
                for (const img of imageAttachments) {
                    const dataUrl = img.base64.startsWith('data:') ? img.base64 : `data:${img.mimeType};base64,${img.base64}`;
                    parts.push({ type: 'image_url', image_url: { url: dataUrl } });
                }
                chatMessages.push({ role: msg.role, content: parts });
            } else {
                chatMessages.push({ role: msg.role, content });
            }
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
            type AnthropicUserContent = string | Array<{ type: 'text'; text: string } | { type: 'image'; source: { type: 'base64'; media_type: string; data: string } }>;
            const anthropicMessages: Array<{ role: 'user' | 'assistant'; content: AnthropicUserContent | Array<{ type: string; id?: string; name?: string; input?: unknown; tool_use_id?: string; content?: string }> }> = [];
            for (let i = 1; i < chatMessages.length; i++) {
                const m = chatMessages[i];
                if (m.role === 'user') {
                    const content = m.content;
                    if (Array.isArray(content)) {
                        const blocks: AnthropicUserContent = content.map((part) => {
                            if (part.type === 'text') return { type: 'text' as const, text: part.text };
                            const url = part.image_url.url;
                            const match = url.match(/^data:image\/([^;]+);base64,(.+)$/);
                            const mediaType = match ? `image/${match[1]}` : 'image/png';
                            const data = match ? match[2] : url.replace(/^data:[^;]+;base64,/, '');
                            return { type: 'image' as const, source: { type: 'base64' as const, media_type: mediaType, data } };
                        });
                        anthropicMessages.push({ role: 'user', content: blocks });
                    } else {
                        anthropicMessages.push({ role: 'user', content });
                    }
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

                // Collect diffs from any edit tool (propose_*, update_section, add_section, remove_section, move_section)
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
