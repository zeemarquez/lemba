/**
 * Summarizer Agent
 * Produces a concise chat message from workflow results (no raw plan or agent dumps).
 */

import { DEFAULT_AGENT_CONFIGS } from '../types';
import { SUMMARIZER_PROMPT } from '../prompts';

interface SummarizerOptions {
    model?: string;
    temperature?: number;
    maxTokens?: number;
}

export class SummarizerAgent {
    private apiKey: string;
    private config = DEFAULT_AGENT_CONFIGS.summarizer;

    constructor(options: { apiKey?: string } = {}) {
        this.apiKey = options.apiKey ?? this.getApiKey();
    }

    private getApiKey(): string {
        const key = typeof window !== 'undefined'
            ? (process.env.NEXT_PUBLIC_OPENAI_API_KEY || '')
            : (process.env.OPENAI_API_KEY || process.env.NEXT_PUBLIC_OPENAI_API_KEY || '');
        return key;
    }

    /**
     * Produce a short user-facing message from a summary of workflow results.
     * No tools; single completion.
     */
    async run(summaryInput: string, options: SummarizerOptions = {}): Promise<string> {
        const model = options.model ?? this.config.model;
        const temperature = options.temperature ?? this.config.temperature;
        const maxTokens = options.maxTokens ?? this.config.maxTokens;

        const response = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${this.apiKey}`,
            },
            body: JSON.stringify({
                model,
                messages: [
                    { role: 'system', content: SUMMARIZER_PROMPT },
                    { role: 'user', content: summaryInput },
                ],
                temperature,
                max_tokens: maxTokens,
            }),
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`OpenAI API error: ${response.status} - ${errorText}`);
        }

        const data = await response.json();
        const content = data.choices?.[0]?.message?.content?.trim();
        return content ?? 'I\'ve processed your request. Please review any proposed changes.';
    }
}
