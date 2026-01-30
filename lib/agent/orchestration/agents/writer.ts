/**
 * Writer Agent
 * Creates and modifies markdown content professionally
 */

import type { LLMProvider } from '../../ai-service';
import { chatCompletionOneRound } from '../../ai-service';
import type { ChatCompletionMessage } from '../../ai-service';
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
    private provider: LLMProvider;
    private apiKey: string;
    private config = DEFAULT_AGENT_CONFIGS.writer;

    constructor(options: { toolRegistry?: ToolRegistry; provider?: LLMProvider; apiKey?: string } = {}) {
        this.toolRegistry = options.toolRegistry || new ToolRegistry();
        this.provider = options.provider ?? 'openai';
        this.apiKey = options.apiKey!;
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
        const messages: ChatCompletionMessage[] = [
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

        const defaultFileId = context.activeDocument?.id;
        let currentMessages: ChatCompletionMessage[] = [...messages];
        let maxIterations = 5;

        while (maxIterations > 0) {
            maxIterations--;
            const result = await chatCompletionOneRound({
                provider: this.provider,
                apiKey: this.apiKey,
                model,
                messages: currentMessages,
                tools: tools as import('../../ai-service').ChatCompletionTool[],
                temperature,
                maxTokens,
            });

            if (result.tool_calls && result.tool_calls.length > 0) {
                currentMessages.push({
                    role: 'assistant',
                    content: result.content || '',
                    tool_calls: result.tool_calls,
                });
                for (const toolCall of result.tool_calls) {
                    const args = JSON.parse(toolCall.function.arguments);
                    const execResult = await this.toolRegistry.execute(toolCall.function.name, args, { defaultFileId });
                    let isDuplicate = false;
                    if (execResult.diff) {
                        isDuplicate = collectedDiffs.some(
                            d =>
                                d.fileId === execResult.diff!.fileId &&
                                (d.description && execResult.diff!.description
                                    ? d.description === execResult.diff!.description
                                    : d.proposedContent === execResult.diff!.proposedContent)
                        );
                        if (!isDuplicate) {
                            collectedDiffs.push(execResult.diff);
                            if (options.onDiffCreated) options.onDiffCreated(execResult.diff);
                        }
                    }
                    let toolContent = JSON.stringify(execResult.data ?? execResult.error);
                    if (isDuplicate) {
                        toolContent += `\n\nThis change was already recorded. Do not repeat. In this response, reply with a brief summary and do not call further tools in this same response.`;
                    } else if (collectedDiffs.length > 0) {
                        toolContent += `\n\nYou have recorded ${collectedDiffs.length} edit(s). If the plan is fully implemented for this request, reply with a brief summary and do not call further tools in this same response.`;
                    }
                    currentMessages.push({
                        role: 'tool',
                        tool_call_id: toolCall.id,
                        content: toolContent,
                    });
                }
                continue;
            }
            return {
                output: result.content || '',
                diffs: collectedDiffs,
            };
        }

        return {
            output: 'Writing task completed - changes proposed.',
            diffs: collectedDiffs,
        };
    }
}
