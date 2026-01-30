/**
 * Planner Agent
 * Creates structured outlines and breaks down complex tasks
 */

import { AgentContext, DEFAULT_AGENT_CONFIGS, generateId } from '../types';
import { ToolRegistry, TOOL_DEFINITIONS, ToolResult } from '../tools';
import { PLANNER_PROMPT } from '../prompts';

interface PlannerOptions {
    model?: string;
    temperature?: number;
    maxTokens?: number;
    onDiffCreated?: (diff: unknown) => void;
}

export class PlannerAgent {
    private toolRegistry: ToolRegistry;
    private apiKey: string;
    private config = DEFAULT_AGENT_CONFIGS.planner;

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
        const messages = [
            { role: 'system' as const, content: systemPrompt },
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

        // Make API call (pass target file so tool calls use it if the model invents a path)
        const defaultFileId = context.activeDocument?.id;
        const response = await this.callOpenAI(messages, tools, {
            model,
            temperature,
            maxTokens,
        }, defaultFileId);

        return response;
    }

    /**
     * Call OpenAI API with tool support
     */
    private async callOpenAI(
        messages: Array<{ role: string; content: string; tool_call_id?: string; tool_calls?: unknown[] }>,
        tools: unknown[],
        options: { model: string; temperature: number; maxTokens: number },
        defaultFileId?: string
    ): Promise<string> {
        let currentMessages = [...messages];
        let maxIterations = 5;

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

                // Execute tools (use defaultFileId when model invents a path)
                for (const toolCall of message.tool_calls) {
                    const args = JSON.parse(toolCall.function.arguments);
                    const result = await this.toolRegistry.execute(toolCall.function.name, args, { defaultFileId });

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

        return 'Planning task timed out - too many iterations.';
    }
}
