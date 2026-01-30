/**
 * Tool Registry
 * Central registry for all tools available to agents
 */

import { DocumentDiff } from '../../types';
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
    InsertPosition
} from '../../document-ops';
import { browserStorage } from '../../../browser-storage';
import { agentLog } from '../../debug';
import { requireFilePath, requireFilePathWithDefault, resolveFilePath } from '../file-path';
import { RAGEngine, defaultRAGEngine } from '../rag';
import { webSearch, WebSearchResult } from './web-search';
import { ragQuery, ragIndex, getRAGContext } from './rag-tools';

// ==================== Tool Types ====================

export interface ToolDefinition {
    name: string;
    description: string;
    parameters: {
        type: 'object';
        properties: Record<string, {
            type: string;
            description: string;
            enum?: string[];
            properties?: Record<string, unknown>;
            required?: string[];
        }>;
        required: string[];
    };
}

export interface ToolResult {
    success: boolean;
    data?: unknown;
    error?: string;
    diff?: DocumentDiff;
}

export type ToolExecutor = (args: Record<string, unknown>) => Promise<ToolResult>;

export interface ExecuteToolOptions {
    ragEngine?: RAGEngine;
    /** When set, tools that take fileId will use this path if the agent's fileId doesn't exist (e.g. active document). */
    defaultFileId?: string | null;
}

// ==================== Tool Definitions ====================

export const TOOL_DEFINITIONS: Record<string, ToolDefinition> = {
    // Read operations
    read_document: {
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
    },
    
    read_document_section: {
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
    },
    
    get_document_metadata: {
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
    },
    
    find_headings: {
        name: 'find_headings',
        description: 'Find all headings in a document, optionally filtered by level',
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
    },
    
    list_files: {
        name: 'list_files',
        description: 'List all available files in the workspace',
        parameters: {
            type: 'object',
            properties: {},
            required: []
        }
    },
    
    // Search operations
    search_in_document: {
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
    },
    
    search_all_documents: {
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
    },
    
    // RAG operations
    rag_query: {
        name: 'rag_query',
        description: 'Semantic search using RAG (Retrieval-Augmented Generation) to find relevant content across documents',
        parameters: {
            type: 'object',
            properties: {
                query: {
                    type: 'string',
                    description: 'Natural language query to search for semantically similar content'
                },
                fileIds: {
                    type: 'string',
                    description: 'Optional comma-separated list of file IDs to search within'
                },
                topK: {
                    type: 'number',
                    description: 'Number of results to return (default: 5)'
                }
            },
            required: ['query']
        }
    },
    
    rag_index: {
        name: 'rag_index',
        description: 'Index a document for RAG semantic search',
        parameters: {
            type: 'object',
            properties: {
                fileId: {
                    type: 'string',
                    description: 'The file path/ID of the document to index'
                }
            },
            required: ['fileId']
        }
    },
    
    get_rag_context: {
        name: 'get_rag_context',
        description: 'Get relevant context from a document for a specific query using RAG',
        parameters: {
            type: 'object',
            properties: {
                query: {
                    type: 'string',
                    description: 'The query to find relevant context for'
                },
                fileId: {
                    type: 'string',
                    description: 'The file path/ID of the document'
                },
                maxChunks: {
                    type: 'number',
                    description: 'Maximum number of context chunks to return (default: 3)'
                }
            },
            required: ['query', 'fileId']
        }
    },
    
    // Web search
    web_search: {
        name: 'web_search',
        description: 'Search the web for information',
        parameters: {
            type: 'object',
            properties: {
                query: {
                    type: 'string',
                    description: 'The search query'
                },
                numResults: {
                    type: 'number',
                    description: 'Number of results to return (default: 5)'
                }
            },
            required: ['query']
        }
    },
    
    // Edit operations
    propose_edit: {
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
    },
    
    propose_insert: {
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
    },
    
    propose_delete: {
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
    },
    
    propose_replace_section: {
        name: 'propose_replace_section',
        description: 'Propose replacing an entire section (from heading to next heading of same/higher level)',
        parameters: {
            type: 'object',
            properties: {
                fileId: {
                    type: 'string',
                    description: 'The file path/ID of the document'
                },
                sectionHeading: {
                    type: 'string',
                    description: 'The heading text of the section to replace'
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
    },
    
    // Lint operations
    lint_markdown: {
        name: 'lint_markdown',
        description: 'Check a markdown document for syntax errors, style issues, and best practice violations',
        parameters: {
            type: 'object',
            properties: {
                fileId: {
                    type: 'string',
                    description: 'The file path/ID of the document to lint'
                }
            },
            required: ['fileId']
        }
    }
};

// Re-export for consumers that need path resolution
export { resolveFilePath, requireFilePath } from '../file-path';

// ==================== Tool Executors ====================

export async function executeTool(
    name: string,
    args: Record<string, unknown>,
    optionsOrRag?: ExecuteToolOptions | RAGEngine
): Promise<ToolResult> {
    agentLog.tool(name, args);
    // Merge options so defaultFileId is preserved when caller passes { defaultFileId } without ragEngine
    const options: ExecuteToolOptions = {
        ragEngine: defaultRAGEngine,
        ...(optionsOrRag && typeof optionsOrRag === 'object' ? (optionsOrRag as ExecuteToolOptions) : {}),
    };
    if (options.ragEngine == null) options.ragEngine = defaultRAGEngine;
    const ragEngine = options.ragEngine;
    const defaultFileId = options.defaultFileId ?? undefined;

    const resolveFile = async (fileId: string): Promise<string> =>
        defaultFileId != null
            ? requireFilePathWithDefault(fileId, defaultFileId)
            : requireFilePath(fileId);

    try {
        switch (name) {
            case 'read_document': {
                const fileId = await resolveFile(args.fileId as string);
                const content = await readDocument(fileId);
                return { success: true, data: content || '(empty document)' };
            }
            
            case 'read_document_section': {
                const fileId = await resolveFile(args.fileId as string);
                const content = await readDocumentSection(
                    fileId,
                    args.startLine as number,
                    args.endLine as number
                );
                return { success: true, data: content || '(empty section)' };
            }
            
            case 'get_document_metadata': {
                const fileId = await resolveFile(args.fileId as string);
                const metadata = await getDocumentMetadata(fileId);
                return { success: true, data: metadata };
            }
            
            case 'find_headings': {
                const fileId = await resolveFile(args.fileId as string);
                const headings = await findHeadings(
                    fileId,
                    args.level as number | undefined
                );
                return { success: true, data: headings };
            }
            
            case 'list_files': {
                const { tree } = await browserStorage.list();
                const files: string[] = [];
                const collectFiles = (nodes: typeof tree) => {
                    for (const node of nodes) {
                        if (node.type === 'file') {
                            files.push(node.id);
                        } else if (node.children) {
                            collectFiles(node.children);
                        }
                    }
                };
                collectFiles(tree);
                return { success: true, data: { files } };
            }
            
            case 'search_in_document': {
                const fileId = await resolveFile(args.fileId as string);
                const results = await searchInDocument(
                    fileId,
                    args.query as string
                );
                return { success: true, data: results };
            }
            
            case 'search_all_documents': {
                const results = await searchAllDocuments(args.query as string);
                return { success: true, data: results };
            }
            
            case 'rag_query': {
                const result = await ragQuery(
                    args.query as string,
                    args.fileIds as string | undefined,
                    args.topK as number | undefined,
                    ragEngine
                );
                return { success: true, data: result };
            }
            
            case 'rag_index': {
                const fileId = await resolveFile(args.fileId as string);
                const result = await ragIndex(fileId, ragEngine);
                return { success: true, data: result };
            }
            
            case 'get_rag_context': {
                const fileId = await resolveFile(args.fileId as string);
                const result = await getRAGContext(
                    args.query as string,
                    fileId,
                    args.maxChunks as number | undefined,
                    ragEngine
                );
                return { success: true, data: result };
            }
            
            case 'web_search': {
                const results = await webSearch(
                    args.query as string,
                    args.numResults as number | undefined
                );
                return { success: true, data: results };
            }
            
            case 'propose_edit': {
                const fileId = await resolveFile(args.fileId as string);
                const diff = await proposeEdit(
                    fileId,
                    args.oldText as string,
                    args.newText as string,
                    args.description as string | undefined
                );
                if (!diff) {
                    return { success: false, error: 'Text not found in document' };
                }
                return { success: true, data: { diffId: diff.id }, diff };
            }
            
            case 'propose_insert': {
                const fileId = await resolveFile(args.fileId as string);
                const position = args.position as { type: string; lineNumber?: number; headingText?: string };
                let insertPos: InsertPosition;
                
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
                        return { success: false, error: 'Invalid position type' };
                }
                
                const diff = await proposeInsert(
                    fileId,
                    insertPos,
                    args.content as string,
                    args.description as string | undefined
                );
                if (!diff) {
                    return { success: false, error: 'Could not insert at specified position' };
                }
                return { success: true, data: { diffId: diff.id }, diff };
            }
            
            case 'propose_delete': {
                const fileId = await resolveFile(args.fileId as string);
                const diff = await proposeDelete(
                    fileId,
                    args.startLine as number,
                    args.endLine as number,
                    args.description as string | undefined
                );
                if (!diff) {
                    return { success: false, error: 'Invalid line range' };
                }
                return { success: true, data: { diffId: diff.id }, diff };
            }
            
            case 'propose_replace_section': {
                const fileId = await resolveFile(args.fileId as string);
                const diff = await proposeReplaceSection(
                    fileId,
                    args.sectionHeading as string,
                    args.newContent as string,
                    args.description as string | undefined
                );
                if (!diff) {
                    return { success: false, error: 'Section heading not found' };
                }
                return { success: true, data: { diffId: diff.id }, diff };
            }
            
            case 'lint_markdown': {
                const fileId = await resolveFile(args.fileId as string);
                const lintResult = await lintMarkdown(fileId);
                return { success: true, data: lintResult };
            }
            
            default:
                return { success: false, error: `Unknown tool: ${name}` };
        }
    } catch (error) {
        console.error(`Tool execution error (${name}):`, error);
        return { success: false, error: String(error) };
    }
}

// ==================== Lint Implementation ====================

interface LintIssue {
    type: 'error' | 'warning' | 'suggestion';
    rule: string;
    message: string;
    line: number;
    column?: number;
    fix?: {
        oldText: string;
        newText: string;
    };
}

interface LintResult {
    fileId: string;
    issues: LintIssue[];
    summary: {
        errors: number;
        warnings: number;
        suggestions: number;
    };
    passed: boolean;
}

async function lintMarkdown(fileId: string): Promise<LintResult> {
    const content = await readDocument(fileId);
    if (!content) {
        return {
            fileId,
            issues: [{ type: 'error', rule: 'file-exists', message: 'File not found', line: 0 }],
            summary: { errors: 1, warnings: 0, suggestions: 0 },
            passed: false
        };
    }

    const lines = content.split('\n');
    const issues: LintIssue[] = [];

    // Track heading levels
    let lastHeadingLevel = 0;
    let consecutiveBlankLines = 0;

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const lineNum = i + 1;

        // Check for headings
        const headingMatch = line.match(/^(#{1,6})\s*(.*)/);
        if (headingMatch) {
            const level = headingMatch[1].length;
            const text = headingMatch[2].trim();

            // Heading hierarchy
            if (lastHeadingLevel > 0 && level > lastHeadingLevel + 1) {
                issues.push({
                    type: 'error',
                    rule: 'heading-hierarchy',
                    message: `Heading level skipped from H${lastHeadingLevel} to H${level}`,
                    line: lineNum,
                    fix: {
                        oldText: headingMatch[1],
                        newText: '#'.repeat(lastHeadingLevel + 1)
                    }
                });
            }

            // Empty heading
            if (!text) {
                issues.push({
                    type: 'error',
                    rule: 'no-empty-heading',
                    message: 'Empty heading',
                    line: lineNum
                });
            }

            lastHeadingLevel = level;
        }

        // Check for blank lines
        if (line.trim() === '') {
            consecutiveBlankLines++;
            if (consecutiveBlankLines > 2) {
                issues.push({
                    type: 'warning',
                    rule: 'no-multiple-blanks',
                    message: 'Multiple consecutive blank lines',
                    line: lineNum
                });
            }
        } else {
            consecutiveBlankLines = 0;
        }

        // Check for trailing whitespace
        if (line !== line.trimEnd() && line.trim() !== '') {
            issues.push({
                type: 'warning',
                rule: 'no-trailing-spaces',
                message: 'Trailing whitespace',
                line: lineNum
            });
        }

        // Check for unclosed code blocks (simple check)
        const codeBlockMatch = line.match(/^```(\w*)/);
        if (codeBlockMatch) {
            // Find closing fence
            let closed = false;
            for (let j = i + 1; j < lines.length; j++) {
                if (lines[j].trim() === '```') {
                    closed = true;
                    break;
                }
            }
            if (!closed) {
                issues.push({
                    type: 'error',
                    rule: 'code-block-closed',
                    message: 'Unclosed code block',
                    line: lineNum
                });
            }
        }

        // Check for images without alt text
        const imgMatch = line.match(/!\[\s*\]\([^)]+\)/);
        if (imgMatch) {
            issues.push({
                type: 'suggestion',
                rule: 'image-alt-text',
                message: 'Image missing alt text',
                line: lineNum
            });
        }

        // Check for broken link syntax
        const brokenLink = line.match(/\[[^\]]*\][^(]/);
        if (brokenLink && !line.match(/\[[^\]]*\]\[[^\]]*\]/)) {
            // Not a reference link
            const linkStart = line.indexOf(brokenLink[0]);
            if (linkStart >= 0 && line[linkStart + brokenLink[0].length - 1] !== '(') {
                issues.push({
                    type: 'warning',
                    rule: 'link-syntax',
                    message: 'Possibly malformed link syntax',
                    line: lineNum,
                    column: linkStart + 1
                });
            }
        }
    }

    const summary = {
        errors: issues.filter(i => i.type === 'error').length,
        warnings: issues.filter(i => i.type === 'warning').length,
        suggestions: issues.filter(i => i.type === 'suggestion').length
    };

    return {
        fileId,
        issues,
        summary,
        passed: summary.errors === 0
    };
}

// ==================== Tool Registry Class ====================

export class ToolRegistry {
    private tools: Map<string, ToolDefinition> = new Map();
    private ragEngine: RAGEngine;

    constructor(ragEngine: RAGEngine = defaultRAGEngine) {
        this.ragEngine = ragEngine;
        
        // Register all default tools
        Object.entries(TOOL_DEFINITIONS).forEach(([name, def]) => {
            this.tools.set(name, def);
        });
    }

    /**
     * Get tools available for a specific agent type
     */
    getToolsForAgent(agentType: string): ToolDefinition[] {
        const toolSets: Record<string, string[]> = {
            orchestrator: ['list_files', 'get_document_metadata'],
            planner: ['get_document_metadata', 'find_headings', 'read_document_section', 'list_files'],
            researcher: ['rag_query', 'rag_index', 'get_rag_context', 'web_search', 'search_in_document', 'search_all_documents', 'read_document', 'list_files'],
            writer: ['propose_edit', 'propose_insert', 'propose_delete', 'propose_replace_section', 'read_document', 'read_document_section', 'find_headings'],
            linter: ['lint_markdown', 'propose_edit', 'read_document', 'find_headings']
        };

        const toolNames = toolSets[agentType] || [];
        return toolNames
            .map(name => this.tools.get(name))
            .filter((t): t is ToolDefinition => t !== undefined);
    }

    /**
     * Execute a tool by name
     */
    async execute(
        name: string,
        args: Record<string, unknown>,
        options?: ExecuteToolOptions
    ): Promise<ToolResult> {
        return executeTool(name, args, { ...options, ragEngine: options?.ragEngine ?? this.ragEngine });
    }

    /**
     * Get all registered tools
     */
    getAllTools(): ToolDefinition[] {
        return Array.from(this.tools.values());
    }

    /**
     * Get a specific tool definition
     */
    getTool(name: string): ToolDefinition | undefined {
        return this.tools.get(name);
    }
}

// Export default instance
export const defaultToolRegistry = new ToolRegistry();
