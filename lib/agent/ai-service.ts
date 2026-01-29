/**
 * AI Service
 * Handles OpenAI API interactions for the AI agent
 */

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
   - Use \`propose_replace_section\` for replacing entire sections

5. **File mentions**: When the user mentions a file with @filename, that file's content may be provided in context. Use this to understand what they're working on.

6. **Be helpful**: Offer suggestions for improving document structure, formatting, or content when appropriate.

7. **Markdown expertise**: You understand markdown syntax well. Help users with formatting, tables, code blocks, links, images, and other markdown features.

## Response Format

- Be concise but helpful
- When proposing edits, explain what you're changing and why
- If you need to read a document first, do so before making suggestions
- Use code blocks when showing markdown examples`;

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

function getApiKey(): string {
    // Try NEXT_PUBLIC first (client-side), then server-side
    const key = typeof window !== 'undefined' 
        ? (process.env.NEXT_PUBLIC_OPENAI_API_KEY || '')
        : (process.env.OPENAI_API_KEY || process.env.NEXT_PUBLIC_OPENAI_API_KEY || '');
    
    if (!key) {
        throw new Error('OpenAI API key not configured. Please set NEXT_PUBLIC_OPENAI_API_KEY in your environment.');
    }
    
    return key;
}

export async function sendMessageToAI(
    messages: AgentMessage[],
    mentionedFiles: string[],
    onDiffCreated?: (diff: DocumentDiff) => void
): Promise<AIResponse> {
    const apiKey = getApiKey();
    
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
        { role: 'system', content: SYSTEM_PROMPT }
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
    
    // Make API call with tools
    const collectedDiffs: DocumentDiff[] = [];
    let maxIterations = 10; // Prevent infinite loops
    
    while (maxIterations > 0) {
        maxIterations--;
        
        const response = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`
            },
            body: JSON.stringify({
                model: 'gpt-4o',
                messages: chatMessages,
                tools: TOOLS,
                tool_choice: 'auto',
                temperature: 0.7,
                max_tokens: 4096
            })
        });
        
        if (!response.ok) {
            const errorText = await response.text();
            console.error('OpenAI API error:', errorText);
            throw new Error(`OpenAI API error: ${response.status} ${response.statusText}`);
        }
        
        const data = await response.json();
        const choice = data.choices[0];
        const message = choice.message;
        
        // Check if there are tool calls
        if (message.tool_calls && message.tool_calls.length > 0) {
            // Add assistant message with tool calls
            chatMessages.push({
                role: 'assistant',
                content: message.content || '',
                tool_calls: message.tool_calls
            });
            
            // Execute each tool call
            for (const toolCall of message.tool_calls) {
                const args = JSON.parse(toolCall.function.arguments);
                const result = await executeTool(toolCall.function.name, args);
                
                // Check if this was an edit operation that created a diff
                if (toolCall.function.name.startsWith('propose_')) {
                    try {
                        const resultObj = JSON.parse(result);
                        if (resultObj.success && resultObj.diff) {
                            collectedDiffs.push(resultObj.diff);
                            if (onDiffCreated) {
                                onDiffCreated(resultObj.diff);
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
        return {
            content: message.content || '',
            diffs: collectedDiffs.length > 0 ? collectedDiffs : undefined
        };
    }
    
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
