/**
 * RAG Tools
 * Tools for Retrieval-Augmented Generation operations
 */

import { RAGEngine, defaultRAGEngine } from '../rag';
import { RAGQueryResult } from '../types';

export interface RAGQueryResponse {
    query: string;
    results: Array<{
        fileId: string;
        heading?: string;
        content: string;
        lines: { start: number; end: number };
        score: number;
        highlights: string[];
    }>;
    totalResults: number;
}

export interface RAGIndexResponse {
    fileId: string;
    chunksCreated: number;
    tokenCount: number;
    success: boolean;
}

export interface RAGContextResponse {
    query: string;
    fileId: string;
    context: string;
    chunks: Array<{
        heading?: string;
        lines: { start: number; end: number };
        content: string;
    }>;
    totalTokens: number;
}

/**
 * Query the RAG engine for semantically relevant content
 */
export async function ragQuery(
    query: string,
    fileIds?: string,
    topK: number = 5,
    ragEngine: RAGEngine = defaultRAGEngine
): Promise<RAGQueryResponse> {
    // Parse fileIds if provided as comma-separated string
    const fileIdArray = fileIds 
        ? fileIds.split(',').map(id => id.trim()).filter(Boolean)
        : undefined;

    const results = await ragEngine.query(query, {
        fileIds: fileIdArray,
        topK,
        minScore: 0.3,
        autoIndex: true
    });

    return {
        query,
        results: results.map(r => ({
            fileId: r.chunk.fileId,
            heading: r.chunk.heading,
            content: r.chunk.content,
            lines: { start: r.chunk.startLine, end: r.chunk.endLine },
            score: Math.round(r.score * 100) / 100,
            highlights: r.highlights || []
        })),
        totalResults: results.length
    };
}

/**
 * Index a document for RAG queries
 */
export async function ragIndex(
    fileId: string,
    ragEngine: RAGEngine = defaultRAGEngine
): Promise<RAGIndexResponse> {
    try {
        const result = await ragEngine.indexDocument(fileId);
        return {
            fileId,
            chunksCreated: result.chunksCreated,
            tokenCount: result.tokenCount,
            success: true
        };
    } catch (error) {
        console.error(`Failed to index document ${fileId}:`, error);
        return {
            fileId,
            chunksCreated: 0,
            tokenCount: 0,
            success: false
        };
    }
}

/**
 * Get relevant context from a specific document
 */
export async function getRAGContext(
    query: string,
    fileId: string,
    maxChunks: number = 3,
    ragEngine: RAGEngine = defaultRAGEngine
): Promise<RAGContextResponse> {
    const result = await ragEngine.getRelevantContext(query, fileId, maxChunks);

    return {
        query,
        fileId,
        context: result.context,
        chunks: result.chunks.map(c => ({
            heading: c.heading,
            lines: { start: c.startLine, end: c.endLine },
            content: c.content
        })),
        totalTokens: result.totalTokens
    };
}

/**
 * Format RAG query results for display
 */
export function formatRAGResults(response: RAGQueryResponse): string {
    if (response.results.length === 0) {
        return `No relevant content found for: "${response.query}"`;
    }

    let output = `## RAG Search Results for: "${response.query}"\n\n`;
    output += `Found ${response.totalResults} relevant sections.\n\n`;

    for (let i = 0; i < response.results.length; i++) {
        const result = response.results[i];
        const location = result.heading 
            ? `**${result.heading}**`
            : `Lines ${result.lines.start}-${result.lines.end}`;
        
        output += `### ${i + 1}. ${result.fileId}\n`;
        output += `**Location**: ${location}\n`;
        output += `**Relevance Score**: ${(result.score * 100).toFixed(0)}%\n\n`;
        
        // Show content preview (first 500 chars)
        const preview = result.content.length > 500 
            ? result.content.substring(0, 500) + '...'
            : result.content;
        output += `\`\`\`markdown\n${preview}\n\`\`\`\n\n`;

        if (result.highlights.length > 0) {
            output += `**Key excerpts**:\n`;
            result.highlights.forEach(h => {
                output += `- "${h.substring(0, 100)}${h.length > 100 ? '...' : ''}"\n`;
            });
            output += '\n';
        }

        output += '---\n\n';
    }

    return output;
}

/**
 * Format RAG context for agent consumption
 */
export function formatRAGContext(response: RAGContextResponse): string {
    if (response.chunks.length === 0) {
        return `No relevant context found in ${response.fileId} for: "${response.query}"`;
    }

    let output = `## Relevant Context from ${response.fileId}\n\n`;
    output += `Query: "${response.query}"\n`;
    output += `Context tokens: ${response.totalTokens}\n\n`;
    output += '---\n\n';
    output += response.context;

    return output;
}

/**
 * Check if a document needs reindexing
 * (e.g., if content has changed since last index)
 */
export function checkIndexStatus(
    fileId: string,
    ragEngine: RAGEngine = defaultRAGEngine
): {
    isIndexed: boolean;
    chunkCount: number;
    needsReindex: boolean;
} {
    const isIndexed = ragEngine.isDocumentIndexed(fileId);
    const structure = ragEngine.getDocumentStructure(fileId);

    return {
        isIndexed,
        chunkCount: structure.totalChunks,
        // This would ideally compare content hashes, but for now just check if indexed
        needsReindex: !isIndexed
    };
}

/**
 * Get statistics about RAG index
 */
export function getRAGStats(ragEngine: RAGEngine = defaultRAGEngine): {
    indexedDocuments: string[];
    totalChunks: number;
    totalEmbeddings: number;
    memoryUsageMB: number;
} {
    const stats = ragEngine.getStats();
    const indexedDocs = ragEngine.getIndexedDocuments();

    return {
        indexedDocuments: indexedDocs,
        totalChunks: stats.vectorStore.totalChunks,
        totalEmbeddings: stats.vectorStore.totalEmbeddings,
        memoryUsageMB: stats.vectorStore.estimatedMemoryMB + stats.embeddingCache.estimatedMemoryMB
    };
}
