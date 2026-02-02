/**
 * Document Chunker
 * Splits documents into semantic chunks for RAG processing
 */

import { RAGChunk, generateId } from '../types';

export interface ChunkingOptions {
    /** Target chunk size in tokens (approximate) */
    targetChunkSize: number;
    /** Overlap between chunks in tokens */
    overlapSize: number;
    /** Whether to split by headings first */
    respectHeadings: boolean;
    /** Minimum chunk size to avoid tiny chunks */
    minChunkSize: number;
}

const DEFAULT_OPTIONS: ChunkingOptions = {
    targetChunkSize: 512,
    overlapSize: 50,
    respectHeadings: true,
    minChunkSize: 100,
};

interface Heading {
    level: number;
    text: string;
    line: number;
}

export class DocumentChunker {
    private options: ChunkingOptions;

    constructor(options: Partial<ChunkingOptions> = {}) {
        this.options = { ...DEFAULT_OPTIONS, ...options };
    }

    /**
     * Chunk a document into RAG-ready chunks
     */
    chunkDocument(fileId: string, content: string): RAGChunk[] {
        if (!content || content.trim().length === 0) {
            return [];
        }

        const lines = content.split('\n');
        const headings = this.extractHeadings(lines);

        if (this.options.respectHeadings && headings.length > 0) {
            return this.chunkByHeadings(fileId, lines, headings);
        }

        return this.chunkBySize(fileId, lines);
    }

    /**
     * Extract all headings from document lines
     */
    private extractHeadings(lines: string[]): Heading[] {
        const headings: Heading[] = [];
        const headingRegex = /^(#{1,6})\s+(.+)$/;

        for (let i = 0; i < lines.length; i++) {
            const match = lines[i].match(headingRegex);
            if (match) {
                headings.push({
                    level: match[1].length,
                    text: match[2].trim(),
                    line: i,
                });
            }
        }

        return headings;
    }

    /**
     * Chunk document by heading sections
     */
    private chunkByHeadings(fileId: string, lines: string[], headings: Heading[]): RAGChunk[] {
        const chunks: RAGChunk[] = [];

        // Add content before first heading if exists
        if (headings.length > 0 && headings[0].line > 0) {
            const preContent = lines.slice(0, headings[0].line).join('\n');
            if (this.estimateTokens(preContent) >= this.options.minChunkSize) {
                chunks.push(this.createChunk(fileId, preContent, 0, headings[0].line - 1));
            }
        }

        // Process each heading section
        for (let i = 0; i < headings.length; i++) {
            const heading = headings[i];
            const nextHeading = headings[i + 1];
            const endLine = nextHeading ? nextHeading.line - 1 : lines.length - 1;
            
            const sectionContent = lines.slice(heading.line, endLine + 1).join('\n');
            const tokenCount = this.estimateTokens(sectionContent);

            if (tokenCount <= this.options.targetChunkSize) {
                // Section fits in one chunk
                chunks.push(this.createChunk(
                    fileId,
                    sectionContent,
                    heading.line,
                    endLine,
                    heading.text,
                    heading.level
                ));
            } else {
                // Section too large, split further
                const subChunks = this.splitLargeSection(
                    fileId,
                    lines.slice(heading.line, endLine + 1),
                    heading.line,
                    heading.text,
                    heading.level
                );
                chunks.push(...subChunks);
            }
        }

        return this.addOverlaps(chunks);
    }

    /**
     * Split a large section into smaller chunks while preserving context
     */
    private splitLargeSection(
        fileId: string,
        sectionLines: string[],
        startLine: number,
        headingText: string,
        headingLevel: number
    ): RAGChunk[] {
        const chunks: RAGChunk[] = [];
        let currentChunkLines: string[] = [];
        let currentStartLine = startLine;
        let currentTokens = 0;

        // Always include the heading in the first chunk
        const headingLine = sectionLines[0];
        currentChunkLines.push(headingLine);
        currentTokens = this.estimateTokens(headingLine);

        for (let i = 1; i < sectionLines.length; i++) {
            const line = sectionLines[i];
            const lineTokens = this.estimateTokens(line);

            if (currentTokens + lineTokens > this.options.targetChunkSize && 
                currentChunkLines.length > 1) {
                // Save current chunk
                chunks.push(this.createChunk(
                    fileId,
                    currentChunkLines.join('\n'),
                    currentStartLine,
                    currentStartLine + currentChunkLines.length - 1,
                    headingText,
                    headingLevel
                ));

                // Start new chunk with context prefix
                currentStartLine = startLine + i;
                currentChunkLines = [`[Continued from: ${headingText}]`, line];
                currentTokens = this.estimateTokens(currentChunkLines.join('\n'));
            } else {
                currentChunkLines.push(line);
                currentTokens += lineTokens;
            }
        }

        // Add final chunk
        if (currentChunkLines.length > 0) {
            chunks.push(this.createChunk(
                fileId,
                currentChunkLines.join('\n'),
                currentStartLine,
                startLine + sectionLines.length - 1,
                headingText,
                headingLevel
            ));
        }

        return chunks;
    }

    /**
     * Chunk document by size when no headings are present
     */
    private chunkBySize(fileId: string, lines: string[]): RAGChunk[] {
        const chunks: RAGChunk[] = [];
        let currentChunkLines: string[] = [];
        let currentStartLine = 0;
        let currentTokens = 0;

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            const lineTokens = this.estimateTokens(line);

            if (currentTokens + lineTokens > this.options.targetChunkSize && 
                currentChunkLines.length > 0) {
                // Save current chunk
                chunks.push(this.createChunk(
                    fileId,
                    currentChunkLines.join('\n'),
                    currentStartLine,
                    currentStartLine + currentChunkLines.length - 1
                ));

                // Start new chunk
                currentStartLine = i;
                currentChunkLines = [line];
                currentTokens = lineTokens;
            } else {
                currentChunkLines.push(line);
                currentTokens += lineTokens;
            }
        }

        // Add final chunk
        if (currentChunkLines.length > 0 && currentTokens >= this.options.minChunkSize) {
            chunks.push(this.createChunk(
                fileId,
                currentChunkLines.join('\n'),
                currentStartLine,
                currentStartLine + currentChunkLines.length - 1
            ));
        }

        return this.addOverlaps(chunks);
    }

    /**
     * Add overlapping content between adjacent chunks
     */
    private addOverlaps(chunks: RAGChunk[]): RAGChunk[] {
        if (chunks.length <= 1 || this.options.overlapSize === 0) {
            return chunks;
        }

        // For now, we keep chunks as-is but could add overlap content
        // This is a simplified implementation - overlap is handled during retrieval
        return chunks;
    }

    /**
     * Create a RAG chunk object
     */
    private createChunk(
        fileId: string,
        content: string,
        startLine: number,
        endLine: number,
        heading?: string,
        headingLevel?: number
    ): RAGChunk {
        return {
            id: generateId(),
            fileId,
            content,
            startLine: startLine + 1, // 1-indexed for user display
            endLine: endLine + 1,
            heading,
            headingLevel,
            tokenCount: this.estimateTokens(content),
        };
    }

    /**
     * Estimate token count for text (rough approximation)
     * GPT models use ~4 characters per token on average
     */
    private estimateTokens(text: string): number {
        return Math.ceil(text.length / 4);
    }

    /**
     * Get chunking statistics for a document
     */
    getChunkingStats(chunks: RAGChunk[]): {
        totalChunks: number;
        totalTokens: number;
        avgTokensPerChunk: number;
        minTokens: number;
        maxTokens: number;
    } {
        if (chunks.length === 0) {
            return {
                totalChunks: 0,
                totalTokens: 0,
                avgTokensPerChunk: 0,
                minTokens: 0,
                maxTokens: 0,
            };
        }

        const tokenCounts = chunks.map(c => c.tokenCount);
        const totalTokens = tokenCounts.reduce((a, b) => a + b, 0);

        return {
            totalChunks: chunks.length,
            totalTokens,
            avgTokensPerChunk: Math.round(totalTokens / chunks.length),
            minTokens: Math.min(...tokenCounts),
            maxTokens: Math.max(...tokenCounts),
        };
    }
}

// Export default instance
export const defaultChunker = new DocumentChunker();
