/**
 * Linter Agent
 * Validates and fixes markdown documents
 */

import { DocumentDiff } from '../../types';
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
    private apiKey: string;
    private config = DEFAULT_AGENT_CONFIGS.linter;

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
        const messages: Array<{ role: string; content: string; tool_call_id?: string; tool_calls?: unknown[] }> = [
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

        // Add instructions (reinforce target file)
        let fullInstructions = instructions;
        if (activeDocument) {
            fullInstructions += `\n\nLint ONLY this document. Use fileId \`${activeDocument.id}\` in the lint_markdown tool call.`;
        }
        messages.push({
            role: 'user',
            content: fullInstructions,
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

        // Make API call
        const response = await this.callOpenAI(messages, tools, {
            model,
            temperature,
            maxTokens,
        }, collectedDiffs, options.onDiffCreated, issueCount, defaultFileId);

        return {
            output: response,
            diffs: collectedDiffs,
            issues: issueCount,
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
        issueCount?: { errors: number; warnings: number; suggestions: number },
        defaultFileId?: string | null
    ): Promise<string> {
        let currentMessages = [...messages];
        let maxIterations = 8;

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

                    // Parse lint results to count issues
                    if (toolCall.function.name === 'lint_markdown' && result.data && issueCount) {
                        const lintData = result.data as { summary?: { errors: number; warnings: number; suggestions: number } };
                        if (lintData.summary) {
                            issueCount.errors = lintData.summary.errors;
                            issueCount.warnings = lintData.summary.warnings;
                            issueCount.suggestions = lintData.summary.suggestions;
                        }
                    }

                    // Collect diffs from fix operations
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

        return 'Linting completed.';
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
