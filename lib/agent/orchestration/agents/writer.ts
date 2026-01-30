/**
 * Writer Agent
 * Creates and modifies markdown content professionally
 */

import { DocumentDiff } from '../../types';
import { AgentContext, DEFAULT_AGENT_CONFIGS, generateId } from '../types';
import { ToolRegistry, ToolResult } from '../tools';
import { WRITER_PROMPT } from '../prompts';

interface WriterOptions {
    model?: string;
    temperature?: number;
    maxTokens?: number;
    onDiffCreated?: (diff: DocumentDiff) => void;
}

interface WriterResult {
    output: string;
    diffs: DocumentDiff[];
}

export class WriterAgent {
    private toolRegistry: ToolRegistry;
    private apiKey: string;
    private config = DEFAULT_AGENT_CONFIGS.writer;

    constructor(options: { toolRegistry?: ToolRegistry; apiKey?: string } = {}) {
        this.toolRegistry = options.toolRegistry || new ToolRegistry();
        this.apiKey = options.apiKey || this.getApiKey();
    }

    private getApiKey(): string {
        const key = typeof window !== 'undefined'
            ? (process.env.NEXT_PUBLIC_OPENAI_API_KEY || '')
            : (process.env.OPENAI_API_KEY || process.env.NEXT_PUBLIC_OPENAI_API_KEY || '');
        return key;
    }

    /**
     * Run the writer agent
     */
    async run(
        instructions: string,
        context: AgentContext,
        options: WriterOptions = {}
    ): Promise<WriterResult> {
        const model = options.model || this.config.model;
        const temperature = options.temperature ?? this.config.temperature;
        const maxTokens = options.maxTokens || this.config.maxTokens;

        const collectedDiffs: DocumentDiff[] = [];

        // Build system prompt
        let systemPrompt = WRITER_PROMPT;

        // Add document context
        if (context.activeDocument) {
            systemPrompt += `\n\n## Target Document (REQUIRED)\n`;
            systemPrompt += `- **File ID (use this EXACT value in every propose_* and read_* tool call):** \`${context.activeDocument.id}\`\n`;
            systemPrompt += `- Name: ${context.activeDocument.name}\n`;
            systemPrompt += `- Lines: ${context.activeDocument.content.split('\n').length}\n`;
            systemPrompt += `\n**CRITICAL:** You must use ONLY the File ID above for every tool call. Never invent or use a different path or filename (e.g. do not use "general_relativity.md" or similar). The user is editing this single open file.\n`;

            // Add structure info
            if (context.activeDocument.metadata?.headings) {
                systemPrompt += `\n### Document Structure:\n`;
                context.activeDocument.metadata.headings.forEach(h => {
                    systemPrompt += `- ${h.text} (H${h.level}, line ${h.line})\n`;
                });
            }

            // For shorter documents, include full content
            const lineCount = context.activeDocument.content.split('\n').length;
            if (lineCount <= 200) {
                systemPrompt += `\n### Current Content:\n`;
                systemPrompt += '```markdown\n' + context.activeDocument.content + '\n```\n';
            } else {
                systemPrompt += `\n**Note**: Document is large. Use read_document_section to read specific parts before editing.\n`;
            }
        }

        // Build messages
        const messages: Array<{ role: string; content: string; tool_call_id?: string; tool_calls?: unknown[] }> = [
            { role: 'system', content: systemPrompt },
        ];

        // Add plan outline if available
        if (context.planOutline) {
            messages.push({
                role: 'user',
                content: `## Plan to Follow\n\n${context.planOutline}`,
            });
        }

        // Add research findings if available
        if (context.researchFindings) {
            messages.push({
                role: 'user',
                content: `## Research to Incorporate\n\n${context.researchFindings}`,
            });
        }

        // Add RAG context if available
        if (context.ragContext && context.ragContext.length > 0) {
            let ragContent = '## Relevant Document Context (from RAG)\n\n';
            context.ragContext.forEach((chunk, i) => {
                ragContent += `### Context ${i + 1}`;
                if (chunk.heading) {
                    ragContent += ` - ${chunk.heading}`;
                }
                ragContent += ` (lines ${chunk.startLine}-${chunk.endLine})\n`;
                ragContent += '```\n' + chunk.content + '\n```\n\n';
            });
            messages.push({ role: 'user', content: ragContent });
        }

        // Add instructions (reinforce target file)
        let finalInstructions = instructions;
        if (context.activeDocument) {
            finalInstructions += `\n\n**Target file for all edits:** Use fileId \`${context.activeDocument.id}\` in every propose_* and read_* tool call.`;
        }
        messages.push({
            role: 'user',
            content: finalInstructions,
        });

        // Get available tools
        const tools = this.toolRegistry.getToolsForAgent('writer').map(tool => ({
            type: 'function' as const,
            function: {
                name: tool.name,
                description: tool.description,
                parameters: tool.parameters,
            },
        }));

        // Make API call
        const defaultFileId = context.activeDocument?.id;
        const response = await this.callOpenAI(messages, tools, {
            model,
            temperature,
            maxTokens,
        }, collectedDiffs, options.onDiffCreated, defaultFileId);

        return {
            output: response,
            diffs: collectedDiffs,
        };
    }

    /**
     * Call OpenAI API with tool support
     */
    private async callOpenAI(
        messages: Array<{ role: string; content: string; tool_call_id?: string; tool_calls?: unknown[] }>,
        tools: unknown[],
        options: { model: string; temperature: number; maxTokens: number },
        collectedDiffs: DocumentDiff[],
        onDiffCreated?: (diff: DocumentDiff) => void,
        defaultFileId?: string | null
    ): Promise<string> {
        let currentMessages = [...messages];
        let maxIterations = 10; // Writer may need multiple tool calls

        while (maxIterations > 0) {
            maxIterations--;

            const response = await fetch('https://api.openai.com/v1/chat/completions', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this.apiKey}`,
                },
                body: JSON.stringify({
                    model: options.model,
                    messages: currentMessages,
                    tools: tools.length > 0 ? tools : undefined,
                    tool_choice: tools.length > 0 ? 'auto' : undefined,
                    temperature: options.temperature,
                    max_tokens: options.maxTokens,
                }),
            });

            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`OpenAI API error: ${response.status} - ${errorText}`);
            }

            const data = await response.json();
            const message = data.choices[0].message;

            // Check for tool calls
            if (message.tool_calls && message.tool_calls.length > 0) {
                currentMessages.push({
                    role: 'assistant',
                    content: message.content || '',
                    tool_calls: message.tool_calls,
                });

                // Execute tools
                for (const toolCall of message.tool_calls) {
                    const args = JSON.parse(toolCall.function.arguments);
                    const result = await this.toolRegistry.execute(toolCall.function.name, args, { defaultFileId });

                    // Collect diffs from edit operations
                    if (result.diff) {
                        collectedDiffs.push(result.diff);
                        if (onDiffCreated) {
                            onDiffCreated(result.diff);
                        }
                    }

                    currentMessages.push({
                        role: 'tool',
                        tool_call_id: toolCall.id,
                        content: JSON.stringify(result.data || result.error),
                    });
                }

                continue;
            }

            // No more tool calls, return the response
            return message.content || '';
        }

        return 'Writing task completed - changes proposed.';
    }
}
