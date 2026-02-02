/**
 * Structure Review Agent
 * Analyzes document structure and fixes duplicates, hierarchy, and section order
 */

import type { LLMProvider } from '../../ai-service';
import { chatCompletionOneRound, buildVisionUserContent } from '../../ai-service';
import type { ChatCompletionMessage } from '../../ai-service';
import { DocumentDiff } from '../../types';
import { mergeDiffsForFile } from '../../diff-utils';
import { AgentContext, DEFAULT_AGENT_CONFIGS } from '../types';
import { ToolRegistry } from '../tools';
import { STRUCTURE_REVIEW_PROMPT } from '../prompts';

interface StructureReviewOptions {
    model?: string;
    temperature?: number;
    maxTokens?: number;
    onDiffCreated?: (diff: DocumentDiff) => void;
}

interface StructureReviewResult {
    output: string;
    diffs: DocumentDiff[];
}

export class StructureReviewAgent {
    private toolRegistry: ToolRegistry;
    private provider: LLMProvider;
    private apiKey: string;
    private config = DEFAULT_AGENT_CONFIGS.structure_review;

    constructor(options: { toolRegistry?: ToolRegistry; provider?: LLMProvider; apiKey?: string } = {}) {
        this.toolRegistry = options.toolRegistry || new ToolRegistry();
        this.provider = options.provider ?? 'openai';
        this.apiKey = options.apiKey!;
    }

    /**
     * Run the structure review agent
     */
    async run(
        instructions: string,
        agentContext: AgentContext,
        options: StructureReviewOptions = {}
    ): Promise<StructureReviewResult> {
        const model = options.model || this.config.model;
        const temperature = options.temperature ?? this.config.temperature;
        const maxTokens = options.maxTokens ?? this.config.maxTokens;

        const collectedDiffs: DocumentDiff[] = [];
        const activeDocument = agentContext.activeDocument;
        const defaultFileId = activeDocument?.id ?? null;
        const contentOverrides: Record<string, string> = { ...(agentContext.contentOverrides ?? {}) };

        let systemPrompt = STRUCTURE_REVIEW_PROMPT;

        if (activeDocument) {
            systemPrompt += `\n\n## Document to Review (REQUIRED)\n`;
            systemPrompt += `- **File ID (use this EXACT value in every tool call):** \`${activeDocument.id}\`\n`;
            systemPrompt += `- Name: ${activeDocument.name}\n`;
            systemPrompt += `- Lines: ${activeDocument.content.split('\n').length}\n`;
            systemPrompt += `\n**CRITICAL:** Use ONLY the File ID above. Never invent or use a different path or filename.\n`;
        }

        const messages: ChatCompletionMessage[] = [
            { role: 'system', content: systemPrompt },
        ];

        if (agentContext.previousResults) {
            const writerResult = agentContext.previousResults.find(r => r.agentType === 'writer');
            if (writerResult?.diffs && writerResult.diffs.length > 0) {
                let diffContext = '## Recent Changes (Writer)\n\nThe Writer agent made changes. Review the resulting structure for duplicates, hierarchy, and order.\n\n';
                writerResult.diffs.forEach((diff, i) => {
                    diffContext += `- ${diff.description || 'Change ' + (i + 1)}\n`;
                });
                messages.push({ role: 'user', content: diffContext });
            }
        }

        let fullInstructions = instructions;
        if (activeDocument) {
            fullInstructions += `\n\nReview ONLY this document. Use fileId \`${activeDocument.id}\` in every tool call.`;
        }
        messages.push({
            role: 'user',
            content: buildVisionUserContent(fullInstructions, agentContext.imageAttachments),
        });

        const tools = this.toolRegistry.getToolsForAgent('structure_review').map(tool => ({
            type: 'function' as const,
            function: {
                name: tool.name,
                description: tool.description,
                parameters: tool.parameters,
            },
        }));

        let currentMessages: ChatCompletionMessage[] = [...messages];
        let maxIterations = 12;

        while (maxIterations > 0) {
            maxIterations--;
            let result;
            try {
                result = await chatCompletionOneRound({
                    provider: this.provider,
                    apiKey: this.apiKey,
                    model,
                    messages: currentMessages,
                    tools: tools as import('../../ai-service').ChatCompletionTool[],
                    temperature,
                    maxTokens,
                });
            } catch (error) {
                const errorMsg = error instanceof Error ? error.message : String(error);
                throw new Error(`Structure review agent API call failed: ${errorMsg}`);
            }

            if (result.tool_calls && result.tool_calls.length > 0) {
                currentMessages.push({
                    role: 'assistant',
                    content: result.content || '',
                    tool_calls: result.tool_calls,
                });
                let editCountThisRound = 0;
                const toolResults: { id: string; content: string }[] = [];
                for (const toolCall of result.tool_calls) {
                    const args = JSON.parse(toolCall.function.arguments);
                    const execResult = await this.toolRegistry.execute(toolCall.function.name, args, {
                        defaultFileId,
                        contentOverrides,
                    });
                    if (execResult.diff) {
                        const isDuplicate = collectedDiffs.some(
                            d =>
                                d.fileId === execResult.diff!.fileId &&
                                d.proposedContent === execResult.diff!.proposedContent
                        );
                        if (!isDuplicate) {
                            collectedDiffs.push(execResult.diff);
                            const merged = mergeDiffsForFile(
                                collectedDiffs.filter(d => d.fileId === execResult.diff!.fileId)
                            );
                            if (merged) {
                                contentOverrides[merged.fileId] = merged.proposedContent;
                            }
                            editCountThisRound++;
                            if (options.onDiffCreated) options.onDiffCreated(execResult.diff);
                        }
                    }
                    toolResults.push({
                        id: toolCall.id,
                        content: JSON.stringify(execResult.data ?? execResult.error),
                    });
                }
                // Append continuation hint to the last tool result so the model keeps fixing until done
                if (editCountThisRound > 0 && toolResults.length > 0) {
                    const last = toolResults[toolResults.length - 1];
                    const hint = `\n\nYou have applied ${collectedDiffs.length} structural edit(s) so far. If get_document_structure showed more duplicates or structural issues, you MUST call remove_section (or update_section, move_section) for each of them before replying with a summary. Only reply with a final summary when all issues are fixed.`;
                    toolResults[toolResults.length - 1] = { ...last, content: last.content + hint };
                }
                for (const tr of toolResults) {
                    currentMessages.push({
                        role: 'tool',
                        tool_call_id: tr.id,
                        content: tr.content,
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
            output: 'Structure review completed.',
            diffs: collectedDiffs,
        };
    }
}
