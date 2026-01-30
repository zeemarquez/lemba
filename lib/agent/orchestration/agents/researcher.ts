/**
 * Researcher Agent
 * Gathers and synthesizes information from multiple sources
 */

import { AgentContext, DEFAULT_AGENT_CONFIGS, generateId } from '../types';
import { ToolRegistry } from '../tools';
import { RAGEngine, defaultRAGEngine } from '../rag';
import { RESEARCHER_PROMPT } from '../prompts';

interface ResearcherOptions {
    model?: string;
    temperature?: number;
    maxTokens?: number;
    onDiffCreated?: (diff: unknown) => void;
}

export class ResearcherAgent {
    private toolRegistry: ToolRegistry;
    private ragEngine: RAGEngine;
    private apiKey: string;
    private config = DEFAULT_AGENT_CONFIGS.researcher;

    constructor(options: {
        toolRegistry?: ToolRegistry;
        ragEngine?: RAGEngine;
        apiKey?: string;
    } = {}) {
        this.toolRegistry = options.toolRegistry || new ToolRegistry();
        this.ragEngine = options.ragEngine || defaultRAGEngine;
        this.apiKey = options.apiKey || this.getApiKey();
    }

    private getApiKey(): string {
        const key = typeof window !== 'undefined'
            ? (process.env.NEXT_PUBLIC_OPENAI_API_KEY || '')
            : (process.env.OPENAI_API_KEY || process.env.NEXT_PUBLIC_OPENAI_API_KEY || '');
        return key;
    }

    /**
     * Run the researcher agent
     */
    async run(
        instructions: string,
        context: AgentContext,
        options: ResearcherOptions = {}
    ): Promise<string> {
        const model = options.model || this.config.model;
        const temperature = options.temperature ?? this.config.temperature;
        const maxTokens = options.maxTokens || this.config.maxTokens;

        // Build system prompt
        let systemPrompt = RESEARCHER_PROMPT;

        // Add context about available documents
        if (context.mentionedFiles && context.mentionedFiles.length > 0) {
            systemPrompt += `\n\n## Available Documents for Research\n`;
            for (const fileId of context.mentionedFiles) {
                const isIndexed = this.ragEngine.isDocumentIndexed(fileId);
                systemPrompt += `- ${fileId} (RAG indexed: ${isIndexed ? 'yes' : 'needs indexing'})\n`;
            }
        }

        // Add active document context
        if (context.activeDocument) {
            systemPrompt += `\n\n## Active Document\n`;
            systemPrompt += `- File: ${context.activeDocument.name}\n`;
            systemPrompt += `- Size: ${context.activeDocument.content.split('\n').length} lines\n`;

            // For long documents, suggest using RAG
            const lineCount = context.activeDocument.content.split('\n').length;
            if (lineCount > 100) {
                systemPrompt += `\n**Note**: This is a long document. Use RAG (rag_query, get_rag_context) for efficient searching.\n`;

                // Auto-index if not already indexed
                if (!this.ragEngine.isDocumentIndexed(context.activeDocument.id)) {
                    try {
                        await this.ragEngine.indexDocument(context.activeDocument.id);
                        systemPrompt += `Document has been indexed for RAG search.\n`;
                    } catch (e) {
                        console.error('Failed to auto-index document:', e);
                    }
                }
            } else {
                // For short documents, include content preview
                systemPrompt += `\n### Document Preview:\n`;
                systemPrompt += '```\n' + context.activeDocument.content.substring(0, 2000) + '\n```\n';
            }
        }

        // Build messages
        const messages = [
            { role: 'system' as const, content: systemPrompt },
        ];

        // Add previous research findings if available
        if (context.researchFindings) {
            messages.push({
                role: 'assistant' as const,
                content: `Previous research findings:\n${context.researchFindings}`,
            });
        }

        // Add plan outline if available (for targeted research)
        if (context.planOutline) {
            messages.push({
                role: 'user' as const,
                content: `Research context from planner:\n${context.planOutline}`,
            });
        }

        // Add current instructions
        messages.push({
            role: 'user' as const,
            content: instructions,
        });

        // Get available tools
        const tools = this.toolRegistry.getToolsForAgent('researcher').map(tool => ({
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
        });

        return response;
    }

    /**
     * Call OpenAI API with tool support
     */
    private async callOpenAI(
        messages: Array<{ role: string; content: string; tool_call_id?: string; tool_calls?: unknown[] }>,
        tools: unknown[],
        options: { model: string; temperature: number; maxTokens: number }
    ): Promise<string> {
        let currentMessages = [...messages];
        let maxIterations = 8; // More iterations for research

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
                    const result = await this.toolRegistry.execute(toolCall.function.name, args);

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

        return 'Research task timed out - gathered partial results.';
    }
}
