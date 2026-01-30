/**
 * Planner Agent
 * Creates structured outlines and breaks down complex tasks
 */

import type { LLMProvider } from '../../ai-service';
import { chatCompletionOneRound } from '../../ai-service';
import type { ChatCompletionMessage } from '../../ai-service';
import { AgentContext, DEFAULT_AGENT_CONFIGS, generateId } from '../types';
import { ToolRegistry, TOOL_DEFINITIONS, ToolResult } from '../tools';
import { PLANNER_PROMPT } from '../prompts';

interface PlannerOptions {
    model?: string;
    temperature?: number;
    maxTokens?: number;
    onDiffCreated?: (diff: import('../../types').DocumentDiff) => void;
}

export class PlannerAgent {
    private toolRegistry: ToolRegistry;
    private provider: LLMProvider;
    private apiKey: string;
    private config = DEFAULT_AGENT_CONFIGS.planner;

    constructor(options: { toolRegistry?: ToolRegistry; provider?: LLMProvider; apiKey?: string } = {}) {
        this.toolRegistry = options.toolRegistry || new ToolRegistry();
        this.provider = options.provider ?? 'openai';
        this.apiKey = options.apiKey!;
    }

    /**
     * Run the planner agent
     */
    async run(
        instructions: string,
        context: AgentContext,
        options: PlannerOptions = {}
    ): Promise<string> {
        const model = options.model || this.config.model;
        const temperature = options.temperature ?? this.config.temperature;
        const maxTokens = options.maxTokens || this.config.maxTokens;

        // Build system prompt with context
        let systemPrompt = PLANNER_PROMPT;

        // Add document context if available
        if (context.activeDocument) {
            systemPrompt += `\n\n## Current Document Context (plan for this file only)\n`;
            systemPrompt += `- **File ID:** \`${context.activeDocument.id}\`\n`;
            systemPrompt += `- Name: ${context.activeDocument.name}\n`;
            systemPrompt += `- Lines: ${context.activeDocument.content.split('\n').length}\n`;
            systemPrompt += `\nAll planning must be for this single document. Do not suggest creating or editing other files.\n`;

            // Add document structure
            if (context.activeDocument.metadata?.headings) {
                systemPrompt += `\n### Document Structure:\n`;
                context.activeDocument.metadata.headings.forEach(h => {
                    systemPrompt += `${'  '.repeat(h.level - 1)}- ${h.text} (H${h.level}, line ${h.line})\n`;
                });
            }
        }

        // Build messages
        const messages: ChatCompletionMessage[] = [
            { role: 'system', content: systemPrompt },
        ];

        // Add conversation history (last few messages for context)
        const recentHistory = context.conversationHistory.slice(-4);
        for (const msg of recentHistory) {
            if (msg.role === 'user' || msg.role === 'assistant') {
                messages.push({
                    role: msg.role as 'user' | 'assistant',
                    content: msg.content,
                });
            }
        }

        // Add current instructions
        messages.push({
            role: 'user' as const,
            content: instructions,
        });

        // Get available tools
        const tools = this.toolRegistry.getToolsForAgent('planner').map(tool => ({
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
                    currentMessages.push({
                        role: 'tool',
                        tool_call_id: toolCall.id,
                        content: JSON.stringify(execResult.data ?? execResult.error),
                    });
                }
                continue;
            }
            return result.content || '';
        }

        return 'Planning task timed out - too many iterations.';
    }
}
