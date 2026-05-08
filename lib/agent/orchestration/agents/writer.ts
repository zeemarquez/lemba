/**
 * Writer Agent
 * Creates and modifies markdown content professionally.
 *
 * The writer runs in one of three variants selected by the router via the
 * orchestrator:
 *   - `quick`:  small targeted edits, minimal system prompt, no full-doc
 *               dump, 2-iteration cap, low temperature, tight tool scope.
 *   - `edit`:   default for section-level edits. Includes plan/research
 *               context when present, 3 iterations.
 *   - `create`: long-form creation. Up to 5 iterations, full context.
 */

import type { LLMProvider } from '../../ai-service';
import { chatCompletionOneRound, buildVisionUserContent } from '../../ai-service';
import type { ChatCompletionMessage } from '../../ai-service';
import { DocumentDiff } from '../../types';
import { mergeDiffsForFile } from '../../diff-utils';
import { AgentContext, DEFAULT_AGENT_CONFIGS } from '../types';
import { ToolRegistry } from '../tools';
import { WRITER_QUICK_PROMPT, WRITER_EDIT_PROMPT, WRITER_CREATE_PROMPT } from '../prompts';
import type { TargetLength } from '../router';

export type WriterVariant = 'quick' | 'edit' | 'create';

interface WriterOptions {
    model?: string;
    temperature?: number;
    maxTokens?: number;
    onDiffCreated?: (diff: DocumentDiff) => void;
    /** Which writer profile to run. Defaults to 'edit'. */
    variant?: WriterVariant;
    /** Concrete length target from the router. */
    targetLength?: TargetLength;
}

interface WriterResult {
    output: string;
    diffs: DocumentDiff[];
}

interface VariantConfig {
    prompt: string;
    /** Iteration cap for the tool-call loop. */
    maxIterations: number;
    /** Override for temperature; undefined = use default. */
    temperature?: number;
    /** Include full document dump when short? */
    includeFullDoc: boolean;
    /** Threshold (in lines) under which we inline the document. */
    fullDocMaxLines: number;
    /** Include plan/research/rag blocks in the prompt. */
    includeAuxContext: boolean;
    /** Allowed tool names for this variant. Empty array = all writer tools. */
    allowedTools?: string[];
}

const VARIANTS: Record<WriterVariant, VariantConfig> = {
    quick: {
        prompt: WRITER_QUICK_PROMPT,
        maxIterations: 2,
        temperature: 0.2,
        includeFullDoc: false,
        fullDocMaxLines: 0,
        includeAuxContext: false,
        allowedTools: ['propose_edit', 'propose_insert', 'propose_replace_section', 'read_document_section', 'find_headings'],
    },
    edit: {
        prompt: WRITER_EDIT_PROMPT,
        maxIterations: 4,
        includeFullDoc: true,
        fullDocMaxLines: 200,
        includeAuxContext: true,
    },
    create: {
        prompt: WRITER_CREATE_PROMPT,
        maxIterations: 8,
        includeFullDoc: true,
        fullDocMaxLines: 400,
        includeAuxContext: true,
    },
};

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

    /** Rough word count from the in-memory content overrides for the active file. */
    private estimateProposedWordCount(contentOverrides: Record<string, string>, fileId?: string): number {
        if (!fileId) return 0;
        const content = contentOverrides[fileId];
        if (!content) return 0;
        return content.split(/\s+/).filter(Boolean).length;
    }

    async run(
        instructions: string,
        context: AgentContext,
        options: WriterOptions = {}
    ): Promise<WriterResult> {
        const variant: WriterVariant = options.variant ?? 'edit';
        const variantConfig = VARIANTS[variant];
        const targetLength = options.targetLength;

        const model = options.model || this.config.model;
        const temperature = options.temperature ?? variantConfig.temperature ?? this.config.temperature;

        // When a concrete word target is specified, use higher maxTokens so
        // the model doesn't hit an artificial ceiling mid-sentence. Rough
        // conversion: 1 word ≈ 1.5 tokens. We double the estimate for safety.
        const baseMaxTokens = options.maxTokens || this.config.maxTokens;
        const maxTokens = targetLength
            ? Math.max(baseMaxTokens, Math.min(16384, Math.round(targetLength.targetWords * 3)))
            : baseMaxTokens;

        const collectedDiffs: DocumentDiff[] = [];
        const contentOverrides: Record<string, string> = { ...(context.contentOverrides ?? {}) };

        let systemPrompt = variantConfig.prompt;

        // Inject a concrete length-target block when the router detected one.
        if (targetLength) {
            systemPrompt += `\n\n## Length Target (IMPORTANT)\n`;
            systemPrompt += `The user asked for ${targetLength.label} content.\n`;
            systemPrompt += `- **Minimum words:** ${targetLength.minWords}\n`;
            systemPrompt += `- **Target words:** ${targetLength.targetWords}\n`;
            if (targetLength.minSections) {
                systemPrompt += `- **Minimum top-level sections:** ${targetLength.minSections}\n`;
            }
            systemPrompt += `\nYou MUST produce content that meets or exceeds these targets. Do NOT stop short.\n`;
            systemPrompt += `If you cannot fit all content into a single tool call, make multiple propose_insert calls to build the document section by section.\n`;
            systemPrompt += `After writing, count your words mentally and add another section if you are below the target.\n`;
        }

        if (context.activeDocument) {
            const lineCount = context.activeDocument.content.split('\n').length;
            systemPrompt += `\n\n## Target Document\n`;
            systemPrompt += `- File ID: \`${context.activeDocument.id}\`\n`;
            systemPrompt += `- Name: ${context.activeDocument.name}\n`;
            systemPrompt += `- Lines: ${lineCount}\n`;

            if (context.activeDocument.metadata?.headings && variant !== 'quick') {
                systemPrompt += `\n### Document Structure\n`;
                context.activeDocument.metadata.headings.forEach(h => {
                    systemPrompt += `- ${h.text} (H${h.level}, line ${h.line})\n`;
                });
            }

            if (variantConfig.includeFullDoc && lineCount <= variantConfig.fullDocMaxLines) {
                systemPrompt += `\n### Current Content\n`;
                systemPrompt += '```markdown\n' + context.activeDocument.content + '\n```\n';
            } else if (variant !== 'quick') {
                systemPrompt += `\n**Note**: Document is large. Use read_document_section to read specific parts before editing.\n`;
            }
        }

        const messages: ChatCompletionMessage[] = [
            { role: 'system', content: systemPrompt },
        ];

        if (variantConfig.includeAuxContext) {
            if (context.planOutline) {
                messages.push({
                    role: 'user',
                    content: `## Plan to Follow\n\n${context.planOutline}`,
                });
            }
            if (context.researchFindings) {
                messages.push({
                    role: 'user',
                    content: `## Research to Incorporate\n\n${context.researchFindings}`,
                });
            }
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
        }

        let finalInstructions = instructions;
        if (context.activeDocument) {
            finalInstructions += `\n\n**Target file for all edits:** Use fileId \`${context.activeDocument.id}\` in every propose_* and read_* tool call.`;
        }
        messages.push({
            role: 'user',
            content: buildVisionUserContent(finalInstructions, context.imageAttachments),
        });

        const allAgentTools = this.toolRegistry.getToolsForAgent('writer');
        const filteredTools = variantConfig.allowedTools && variantConfig.allowedTools.length > 0
            ? allAgentTools.filter(t => variantConfig.allowedTools!.includes(t.name))
            : allAgentTools;
        const tools = filteredTools.map(tool => ({
            type: 'function' as const,
            function: {
                name: tool.name,
                description: tool.description,
                parameters: tool.parameters,
            },
        }));

        const defaultFileId = context.activeDocument?.id;
        let currentMessages: ChatCompletionMessage[] = [...messages];
        // When we have a length target, give the writer extra iterations.
        let maxIterations = targetLength
            ? Math.max(variantConfig.maxIterations, 10)
            : variantConfig.maxIterations;

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
                throw new Error(`Writer agent API call failed: ${errorMsg}`);
            }

            if (result.tool_calls && result.tool_calls.length > 0) {
                currentMessages.push({
                    role: 'assistant',
                    content: result.content || '',
                    tool_calls: result.tool_calls,
                });
                for (const toolCall of result.tool_calls) {
                    const args = JSON.parse(toolCall.function.arguments);
                    const execResult = await this.toolRegistry.execute(toolCall.function.name, args, {
                        defaultFileId,
                        contentOverrides,
                    });
                    let isDuplicate = false;
                    if (execResult.diff) {
                        isDuplicate = collectedDiffs.some(
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
                            if (options.onDiffCreated) options.onDiffCreated(execResult.diff);
                        }
                    }
                    let toolContent = JSON.stringify(execResult.data ?? execResult.error);
                    if (isDuplicate) {
                        toolContent += `\n\nThis change was already recorded. Do not repeat. Reply with a brief summary now; do not call further tools.`;
                    } else if (targetLength && collectedDiffs.length > 0) {
                        // For length-targeted writes, compute approximate word count
                        // of the proposed content so the model knows whether to keep going.
                        const totalWords = this.estimateProposedWordCount(contentOverrides, context.activeDocument?.id);
                        if (totalWords < targetLength.minWords) {
                            toolContent += `\n\n[Word count check: ~${totalWords} words so far, target minimum is ${targetLength.minWords}. You MUST continue writing and add more sections/content until reaching at least ${targetLength.targetWords} words. Call propose_insert to add the next section.]`;
                        } else {
                            toolContent += `\n\n[Word count check: ~${totalWords} words — target of ${targetLength.targetWords} reached. You may finalize with a brief summary.]`;
                        }
                    } else if (collectedDiffs.length > 0) {
                        toolContent += `\n\nYou have recorded ${collectedDiffs.length} edit(s). If the request is satisfied, reply with a brief summary and do not call further tools in this response.`;
                    }
                    currentMessages.push({
                        role: 'tool',
                        tool_call_id: toolCall.id,
                        content: toolContent,
                    });
                }
                continue;
            }

            // If the model stopped calling tools but we haven't met the
            // target length, nudge it to keep going.
            if (targetLength && collectedDiffs.length > 0 && maxIterations > 0) {
                const totalWords = this.estimateProposedWordCount(contentOverrides, context.activeDocument?.id);
                if (totalWords < targetLength.minWords) {
                    currentMessages.push({
                        role: 'user',
                        content: `[System: The current content is ~${totalWords} words, which is below the ${targetLength.targetWords}-word target. Continue writing by calling propose_insert to add more sections until the target is reached. Do not apologize or summarize yet — just add content.]`,
                    });
                    continue;
                }
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
