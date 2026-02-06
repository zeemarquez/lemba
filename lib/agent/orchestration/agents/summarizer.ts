/**
 * Summarizer Agent
 * Produces a concise chat message from workflow results (no raw plan or agent dumps).
 */

import type { LLMProvider } from '../../ai-service';
import { chatCompletion } from '../../ai-service';
import { DEFAULT_AGENT_CONFIGS } from '../types';
import { SUMMARIZER_PROMPT } from '../prompts';

interface SummarizerOptions {
    model?: string;
    temperature?: number;
    maxTokens?: number;
}

export class SummarizerAgent {
    private provider: LLMProvider;
    private apiKey: string;
    private config = DEFAULT_AGENT_CONFIGS.summarizer;

    constructor(options: { provider?: LLMProvider; apiKey?: string } = {}) {
        this.provider = options.provider ?? 'openai';
        this.apiKey = options.apiKey!;
    }

    /**
     * Produce a short user-facing message from a summary of workflow results.
     * No tools; single completion.
     */
    async run(summaryInput: string, options: SummarizerOptions = {}): Promise<string> {
        const model = options.model ?? this.config.model;
        const temperature = options.temperature ?? this.config.temperature;
        const maxTokens = options.maxTokens ?? this.config.maxTokens;

        const content = await chatCompletion({
            provider: this.provider,
            apiKey: this.apiKey,
            model,
            messages: [
                { role: 'system', content: SUMMARIZER_PROMPT },
                { role: 'user', content: summaryInput },
            ],
            temperature,
            maxTokens,
        });
        return content?.trim() ?? 'I\'ve processed your request. Please review any proposed changes.';
    }
}
