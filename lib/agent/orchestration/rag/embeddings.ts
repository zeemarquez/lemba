/**
 * Embedding Service
 * Generates embeddings for text using OpenAI's embedding API
 */

export interface EmbeddingOptions {
    model: string;
    apiKey?: string;
    batchSize: number;
}

const DEFAULT_OPTIONS: EmbeddingOptions = {
    model: 'text-embedding-3-small',
    batchSize: 100,
};

export interface EmbeddingResult {
    text: string;
    embedding: number[];
    tokenCount: number;
}

export class EmbeddingService {
    private options: EmbeddingOptions;
    private cache: Map<string, number[]> = new Map();

    constructor(options: Partial<EmbeddingOptions> = {}) {
        this.options = { ...DEFAULT_OPTIONS, ...options };
    }

    /**
     * Get API key from options or environment
     */
    private getApiKey(): string {
        if (this.options.apiKey) {
            return this.options.apiKey;
        }

        const key = typeof window !== 'undefined'
            ? (process.env.NEXT_PUBLIC_OPENAI_API_KEY || '')
            : (process.env.OPENAI_API_KEY || process.env.NEXT_PUBLIC_OPENAI_API_KEY || '');

        if (!key) {
            throw new Error('OpenAI API key not configured for embeddings');
        }

        return key;
    }

    /**
     * Generate embedding for a single text
     */
    async embed(text: string): Promise<number[]> {
        // Check cache first
        const cacheKey = this.getCacheKey(text);
        const cached = this.cache.get(cacheKey);
        if (cached) {
            return cached;
        }

        const results = await this.embedBatch([text]);
        return results[0].embedding;
    }

    /**
     * Generate embeddings for multiple texts
     */
    async embedBatch(texts: string[]): Promise<EmbeddingResult[]> {
        if (texts.length === 0) {
            return [];
        }

        const results: EmbeddingResult[] = [];
        const uncachedTexts: string[] = [];
        const uncachedIndices: number[] = [];

        // Check cache for each text
        for (let i = 0; i < texts.length; i++) {
            const text = texts[i];
            const cacheKey = this.getCacheKey(text);
            const cached = this.cache.get(cacheKey);

            if (cached) {
                results[i] = {
                    text,
                    embedding: cached,
                    tokenCount: this.estimateTokens(text),
                };
            } else {
                uncachedTexts.push(text);
                uncachedIndices.push(i);
            }
        }

        // Fetch uncached embeddings in batches
        if (uncachedTexts.length > 0) {
            const batches = this.createBatches(uncachedTexts, this.options.batchSize);
            let batchOffset = 0;

            for (const batch of batches) {
                const batchResults = await this.fetchEmbeddings(batch);

                for (let i = 0; i < batchResults.length; i++) {
                    const originalIndex = uncachedIndices[batchOffset + i];
                    const text = batch[i];
                    const embedding = batchResults[i];

                    // Cache the result
                    this.cache.set(this.getCacheKey(text), embedding);

                    results[originalIndex] = {
                        text,
                        embedding,
                        tokenCount: this.estimateTokens(text),
                    };
                }

                batchOffset += batch.length;
            }
        }

        return results;
    }

    /**
     * Fetch embeddings from OpenAI API
     */
    private async fetchEmbeddings(texts: string[]): Promise<number[][]> {
        const apiKey = this.getApiKey();

        const response = await fetch('https://api.openai.com/v1/embeddings', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`,
            },
            body: JSON.stringify({
                model: this.options.model,
                input: texts,
            }),
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error('OpenAI Embeddings API error:', errorText);
            throw new Error(`Embeddings API error: ${response.status} ${response.statusText}`);
        }

        const data = await response.json();
        
        // Sort by index to ensure correct order
        const sortedData = data.data.sort((a: { index: number }, b: { index: number }) => a.index - b.index);
        
        return sortedData.map((item: { embedding: number[] }) => item.embedding);
    }

    /**
     * Calculate cosine similarity between two embeddings
     */
    cosineSimilarity(a: number[], b: number[]): number {
        if (a.length !== b.length) {
            throw new Error('Embeddings must have the same dimension');
        }

        let dotProduct = 0;
        let normA = 0;
        let normB = 0;

        for (let i = 0; i < a.length; i++) {
            dotProduct += a[i] * b[i];
            normA += a[i] * a[i];
            normB += b[i] * b[i];
        }

        if (normA === 0 || normB === 0) {
            return 0;
        }

        return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
    }

    /**
     * Find most similar embeddings from a list
     */
    findMostSimilar(
        queryEmbedding: number[],
        embeddings: number[][],
        topK: number = 5
    ): { index: number; score: number }[] {
        const similarities = embeddings.map((embedding, index) => ({
            index,
            score: this.cosineSimilarity(queryEmbedding, embedding),
        }));

        return similarities
            .sort((a, b) => b.score - a.score)
            .slice(0, topK);
    }

    /**
     * Create batches from array
     */
    private createBatches<T>(items: T[], batchSize: number): T[][] {
        const batches: T[][] = [];
        for (let i = 0; i < items.length; i += batchSize) {
            batches.push(items.slice(i, i + batchSize));
        }
        return batches;
    }

    /**
     * Generate cache key for text
     */
    private getCacheKey(text: string): string {
        // Simple hash for cache key
        let hash = 0;
        for (let i = 0; i < text.length; i++) {
            const char = text.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash;
        }
        return `${this.options.model}:${hash}:${text.length}`;
    }

    /**
     * Estimate token count for text
     */
    private estimateTokens(text: string): number {
        return Math.ceil(text.length / 4);
    }

    /**
     * Clear the embedding cache
     */
    clearCache(): void {
        this.cache.clear();
    }

    /**
     * Get cache statistics
     */
    getCacheStats(): { size: number; estimatedMemoryMB: number } {
        let totalElements = 0;
        this.cache.forEach((embedding) => {
            totalElements += embedding.length;
        });

        return {
            size: this.cache.size,
            // Each float64 is 8 bytes
            estimatedMemoryMB: (totalElements * 8) / (1024 * 1024),
        };
    }
}

// Export default instance
export const defaultEmbeddingService = new EmbeddingService();
