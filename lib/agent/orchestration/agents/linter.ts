/**
 * Linter Agent
 * Validates and fixes markdown documents
 */

import type { LLMProvider } from '../../ai-service';
import { chatCompletionOneRound, buildVisionUserContent } from '../../ai-service';
import type { ChatCompletionMessage } from '../../ai-service';
import { DocumentDiff } from '../../types';
import { mergeDiffsForFile } from '../../diff-utils';
import { AgentContext, DEFAULT_AGENT_CONFIGS, generateId } from '../types';
import { ToolRegistry, ToolResult } from '../tools';
import { LINTER_PROMPT } from '../prompts';

interface LinterOptions {
    model?: string;
    temperature?: number;
    maxTokens?: number;
    onDiffCreated?: (diff: DocumentDiff) => void;
    autoFix?: boolean;
}

interface LinterResult {
    output: string;
    diffs: DocumentDiff[];
    issues: {
        errors: number;
        warnings: number;
        suggestions: number;
    };
}

export class LinterAgent {
    private toolRegistry: ToolRegistry;
    private provider: LLMProvider;
    private apiKey: string;
    private config = DEFAULT_AGENT_CONFIGS.linter;

    constructor(options: { toolRegistry?: ToolRegistry; provider?: LLMProvider; apiKey?: string } = {}) {
        this.toolRegistry = options.toolRegistry || new ToolRegistry();
        this.provider = options.provider ?? 'openai';
        this.apiKey = options.apiKey!;
    }

    /**
     * Run the linter agent
     */
    async run(
        instructions: string,
        agentContext: AgentContext,
        options: LinterOptions = {}
    ): Promise<LinterResult> {
        const model = options.model || this.config.model;
        const temperature = options.temperature ?? this.config.temperature;
        const maxTokens = options.maxTokens || this.config.maxTokens;
        const autoFix = options.autoFix ?? true;

        const collectedDiffs: DocumentDiff[] = [];
        let issueCount = { errors: 0, warnings: 0, suggestions: 0 };
        const contentOverrides: Record<string, string> = { ...(agentContext.contentOverrides ?? {}) };

        // Capture once so async/tool code never references agentContext
        const activeDocument = agentContext.activeDocument;
        const defaultFileId = activeDocument?.id ?? null;

        // Build system prompt
        let systemPrompt = LINTER_PROMPT;

        // Add mode-specific instructions
        if (autoFix) {
            systemPrompt += `\n\n## Auto-Fix Mode\nYou should automatically propose fixes for all errors and warnings found. Use the propose_edit tool to fix issues.`;
        } else {
            systemPrompt += `\n\n## Report-Only Mode\nOnly report issues found. Do not propose fixes unless explicitly asked.`;
        }

        // Add document context
        if (activeDocument) {
            systemPrompt += `\n\n## Document to Lint (REQUIRED)\n`;
            systemPrompt += `- **File ID (use this EXACT value in lint_markdown and every tool call):** \`${activeDocument.id}\`\n`;
            systemPrompt += `- Name: ${activeDocument.name}\n`;
            systemPrompt += `- Lines: ${activeDocument.content.split('\n').length}\n`;
            systemPrompt += `\n**CRITICAL:** Use ONLY the File ID above. Never invent or use a different path or filename.\n`;
        }

        // Build messages
        const messages: ChatCompletionMessage[] = [
            { role: 'system', content: systemPrompt },
        ];

        // If there were previous diffs (from writer), note them
        if (agentContext.previousResults) {
            const writerResult = agentContext.previousResults.find(r => r.agentType === 'writer');
            if (writerResult?.diffs && writerResult.diffs.length > 0) {
                let diffContext = '## Recent Changes to Review\n\n';
                diffContext += 'The Writer agent made the following changes. Please verify they are correct:\n\n';
                writerResult.diffs.forEach((diff, i) => {
                    diffContext += `### Change ${i + 1}: ${diff.description || 'Untitled change'}\n`;
                    diffContext += `- File: ${diff.fileName}\n`;
                    diffContext += `- Type: ${diff.type}\n`;
                });
                messages.push({ role: 'user', content: diffContext });
            }
        }

        // Add instructions (reinforce target file; with optional image attachments for vision)
        let fullInstructions = instructions;
        if (activeDocument) {
            fullInstructions += `\n\nLint ONLY this document. Use fileId \`${activeDocument.id}\` in the lint_markdown tool call.`;
        }
        messages.push({
            role: 'user',
            content: buildVisionUserContent(fullInstructions, agentContext.imageAttachments),
        });

        // Get available tools
        const tools = this.toolRegistry.getToolsForAgent('linter').map(tool => ({
            type: 'function' as const,
            function: {
                name: tool.name,
                description: tool.description,
                parameters: tool.parameters,
            },
        }));

        let currentMessages: ChatCompletionMessage[] = [...messages];
        let maxIterations = 8;

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
                throw new Error(`Linter agent API call failed: ${errorMsg}`);
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
                    if (toolCall.function.name === 'lint_markdown' && execResult.data && issueCount) {
                        const lintData = execResult.data as { summary?: { errors: number; warnings: number; suggestions: number } };
                        if (lintData.summary) {
                            issueCount.errors = lintData.summary.errors;
                            issueCount.warnings = lintData.summary.warnings;
                            issueCount.suggestions = lintData.summary.suggestions;
                        }
                    }
                    if (execResult.diff) {
                        collectedDiffs.push(execResult.diff);
                        const merged = mergeDiffsForFile(
                            collectedDiffs.filter(d => d.fileId === execResult.diff!.fileId)
                        );
                        if (merged) {
                            contentOverrides[merged.fileId] = merged.proposedContent;
                        }
                        if (options.onDiffCreated) options.onDiffCreated(execResult.diff);
                    }
                    currentMessages.push({
                        role: 'tool',
                        tool_call_id: toolCall.id,
                        content: JSON.stringify(execResult.data ?? execResult.error),
                    });
                }
                continue;
            }
            return {
                output: result.content || '',
                diffs: collectedDiffs,
                issues: issueCount,
            };
        }

        return {
            output: 'Linting completed.',
            diffs: collectedDiffs,
            issues: issueCount,
        };
    }

    /**
     * Quick lint check without AI (just runs the lint tool)
     */
    async quickLint(fileId: string): Promise<{
        passed: boolean;
        issues: Array<{
            type: 'error' | 'warning' | 'suggestion';
            message: string;
            line: number;
        }>;
        summary: { errors: number; warnings: number; suggestions: number };
    }> {
        const result = await this.toolRegistry.execute('lint_markdown', { fileId });

        if (!result.success || !result.data) {
            return {
                passed: false,
                issues: [{ type: 'error', message: result.error || 'Lint failed', line: 0 }],
                summary: { errors: 1, warnings: 0, suggestions: 0 },
            };
        }

        const lintData = result.data as {
            passed: boolean;
            issues: Array<{ type: 'error' | 'warning' | 'suggestion'; message: string; line: number }>;
            summary: { errors: number; warnings: number; suggestions: number };
        };

        return lintData;
    }
}
