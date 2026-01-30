/**
 * RAG Engine
 * Main entry point for Retrieval-Augmented Generation functionality
 */

import { RAGChunk, RAGQueryResult } from '../types';
import { DocumentChunker, defaultChunker, ChunkingOptions } from './chunker';
import { EmbeddingService, defaultEmbeddingService } from './embeddings';
import { VectorStore, defaultVectorStore } from './vector-store';
import { browserStorage } from '../../../browser-storage';
import { resolveFilePath } from '../file-path';

export interface RAGEngineOptions {
    chunker?: DocumentChunker;
    embeddingService?: EmbeddingService;
    vectorStore?: VectorStore;
    chunkingOptions?: Partial<ChunkingOptions>;
    autoIndex?: boolean;
}

export class RAGEngine {
    private chunker: DocumentChunker;
    private embeddingService: EmbeddingService;
    private vectorStore: VectorStore;
    private autoIndex: boolean;

    constructor(options: RAGEngineOptions = {}) {
        this.chunker = options.chunker || defaultChunker;
        this.embeddingService = options.embeddingService || defaultEmbeddingService;
        this.vectorStore = options.vectorStore || defaultVectorStore;
        this.autoIndex = options.autoIndex ?? true;
    }

    /**
     * Index a document for RAG queries
     */
    async indexDocument(fileId: string): Promise<{
        chunksCreated: number;
        tokenCount: number;
    }> {
        // Resolve path (LLM or caller may pass filename or partial path)
        const resolvedPath = await resolveFilePath(fileId);
        if (!resolvedPath) {
            throw new Error(`Document not found: ${fileId}`);
        }

        // Read document content
        const content = await browserStorage.readFile(resolvedPath);
        if (!content) {
            throw new Error(`Document not found: ${fileId}`);
        }

        // Generate content hash for change detection
        const contentHash = this.hashContent(content);

        // Check if already indexed with same content
        const existing = this.vectorStore.getIndexEntry(resolvedPath);
        if (existing && existing.contentHash === contentHash) {
            return {
                chunksCreated: existing.chunks.length,
                tokenCount: existing.chunks.reduce((sum, c) => sum + c.tokenCount, 0),
            };
        }

        // Chunk the document
        const chunks = this.chunker.chunkDocument(resolvedPath, content);

        // Index chunks in vector store
        await this.vectorStore.indexDocument(resolvedPath, chunks, contentHash);

        const stats = this.chunker.getChunkingStats(chunks);

        return {
            chunksCreated: stats.totalChunks,
            tokenCount: stats.totalTokens,
        };
    }

    /**
     * Index multiple documents
     */
    async indexDocuments(fileIds: string[]): Promise<{
        indexed: number;
        failed: string[];
        totalChunks: number;
    }> {
        let indexed = 0;
        let totalChunks = 0;
        const failed: string[] = [];

        for (const fileId of fileIds) {
            try {
                const result = await this.indexDocument(fileId);
                indexed++;
                totalChunks += result.chunksCreated;
            } catch (error) {
                console.error(`Failed to index ${fileId}:`, error);
                failed.push(fileId);
            }
        }

        return { indexed, failed, totalChunks };
    }

    /**
     * Query for relevant document chunks
     */
    async query(
        queryText: string,
        options: {
            fileIds?: string[];
            topK?: number;
            minScore?: number;
            autoIndex?: boolean;
        } = {}
    ): Promise<RAGQueryResult[]> {
        const { fileIds, topK = 5, minScore = 0.5, autoIndex = this.autoIndex } = options;

        // Resolve all fileIds to storage paths (handles filename-only or partial paths)
        let resolvedFileIds: string[] | undefined;
        if (fileIds && fileIds.length > 0) {
            resolvedFileIds = [];
            for (const fileId of fileIds) {
                const resolved = await resolveFilePath(fileId);
                if (resolved) resolvedFileIds.push(resolved);
            }
        }

        // Auto-index if enabled and files specified
        if (autoIndex && resolvedFileIds && resolvedFileIds.length > 0) {
            for (const resolvedPath of resolvedFileIds) {
                if (!this.vectorStore.isIndexed(resolvedPath)) {
                    try {
                        await this.indexDocument(resolvedPath);
                    } catch (error) {
                        console.error(`Auto-index failed for ${resolvedPath}:`, error);
                    }
                }
            }
        }

        // Query vector store (use resolved paths)
        return this.vectorStore.query(queryText, {
            fileIds: resolvedFileIds ?? fileIds,
            topK,
            minScore,
        });
    }

    /**
     * Get relevant context for a query in a specific document
     */
    async getRelevantContext(
        query: string,
        fileId: string,
        maxChunks: number = 3
    ): Promise<{
        context: string;
        chunks: RAGChunk[];
        totalTokens: number;
    }> {
        // Ensure document is indexed
        if (!this.vectorStore.isIndexed(fileId)) {
            await this.indexDocument(fileId);
        }

        // Query for relevant chunks
        const results = await this.query(query, {
            fileIds: [fileId],
            topK: maxChunks,
            minScore: 0.3,
        });

        const chunks = results.map(r => r.chunk);
        const totalTokens = chunks.reduce((sum, c) => sum + c.tokenCount, 0);

        // Format context with section markers
        const contextParts = chunks.map((chunk, i) => {
            const location = chunk.heading
                ? `[Section: ${chunk.heading}]`
                : `[Lines ${chunk.startLine}-${chunk.endLine}]`;
            return `--- Context ${i + 1} ${location} ---\n${chunk.content}`;
        });

        return {
            context: contextParts.join('\n\n'),
            chunks,
            totalTokens,
        };
    }

    /**
     * Get document structure via chunks
     */
    getDocumentStructure(fileId: string): {
        sections: Array<{
            heading: string | undefined;
            startLine: number;
            endLine: number;
            tokenCount: number;
        }>;
        totalChunks: number;
        isIndexed: boolean;
    } {
        const chunks = this.vectorStore.getDocumentChunks(fileId);

        return {
            sections: chunks.map(c => ({
                heading: c.heading,
                startLine: c.startLine,
                endLine: c.endLine,
                tokenCount: c.tokenCount,
            })),
            totalChunks: chunks.length,
            isIndexed: this.vectorStore.isIndexed(fileId),
        };
    }

    /**
     * Remove a document from the index
     */
    async removeDocument(fileId: string): Promise<void> {
        await this.vectorStore.removeDocument(fileId);
    }

    /**
     * Check if a document is indexed
     */
    isDocumentIndexed(fileId: string): boolean {
        return this.vectorStore.isIndexed(fileId);
    }

    /**
     * Get all indexed document IDs
     */
    getIndexedDocuments(): string[] {
        return this.vectorStore.getIndexedFileIds();
    }

    /**
     * Simple content hash for change detection
     */
    private hashContent(content: string): string {
        let hash = 0;
        for (let i = 0; i < content.length; i++) {
            const char = content.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash;
        }
        return `${hash}:${content.length}`;
    }

    /**
     * Get RAG engine statistics
     */
    getStats(): {
        vectorStore: ReturnType<VectorStore['getStats']>;
        embeddingCache: ReturnType<EmbeddingService['getCacheStats']>;
    } {
        return {
            vectorStore: this.vectorStore.getStats(),
            embeddingCache: this.embeddingService.getCacheStats(),
        };
    }

    /**
     * Clear all RAG data
     */
    async clear(): Promise<void> {
        await this.vectorStore.clear();
        this.embeddingService.clearCache();
    }
}

// Export components
export { DocumentChunker, ChunkingOptions } from './chunker';
export { EmbeddingService } from './embeddings';
export { VectorStore } from './vector-store';

// Export default instances
export const defaultRAGEngine = new RAGEngine();
