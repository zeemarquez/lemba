/**
 * Vector Store
 * In-memory vector storage with IndexedDB persistence for RAG
 */

import { RAGChunk, RAGQueryResult, RAGIndexEntry, generateId } from '../types';
import { EmbeddingService, defaultEmbeddingService } from './embeddings';

const DB_NAME = 'markdown-editor-rag';
const DB_VERSION = 1;
const STORE_NAME = 'vectors';

export interface VectorStoreOptions {
    embeddingService?: EmbeddingService;
    persistToIndexedDB?: boolean;
}

export class VectorStore {
    private embeddingService: EmbeddingService;
    private persistToIndexedDB: boolean;
    private index: Map<string, RAGIndexEntry> = new Map();
    private db: IDBDatabase | null = null;
    private dbInitPromise: Promise<void> | null = null;

    constructor(options: VectorStoreOptions = {}) {
        this.embeddingService = options.embeddingService || defaultEmbeddingService;
        this.persistToIndexedDB = options.persistToIndexedDB ?? true;

        if (this.persistToIndexedDB && typeof window !== 'undefined') {
            this.dbInitPromise = this.initIndexedDB();
        }
    }

    /**
     * Initialize IndexedDB
     */
    private async initIndexedDB(): Promise<void> {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(DB_NAME, DB_VERSION);

            request.onerror = () => {
                console.error('Failed to open IndexedDB for vector store');
                reject(request.error);
            };

            request.onsuccess = () => {
                this.db = request.result;
                this.loadFromIndexedDB().then(resolve).catch(reject);
            };

            request.onupgradeneeded = (event) => {
                const db = (event.target as IDBOpenDBRequest).result;
                if (!db.objectStoreNames.contains(STORE_NAME)) {
                    db.createObjectStore(STORE_NAME, { keyPath: 'fileId' });
                }
            };
        });
    }

    /**
     * Load existing data from IndexedDB
     */
    private async loadFromIndexedDB(): Promise<void> {
        if (!this.db) return;

        return new Promise((resolve, reject) => {
            const transaction = this.db!.transaction([STORE_NAME], 'readonly');
            const store = transaction.objectStore(STORE_NAME);
            const request = store.getAll();

            request.onsuccess = () => {
                const entries = request.result as RAGIndexEntry[];
                for (const entry of entries) {
                    this.index.set(entry.fileId, entry);
                }
                resolve();
            };

            request.onerror = () => {
                console.error('Failed to load from IndexedDB');
                reject(request.error);
            };
        });
    }

    /**
     * Save entry to IndexedDB
     */
    private async saveToIndexedDB(entry: RAGIndexEntry): Promise<void> {
        if (!this.db) return;

        return new Promise((resolve, reject) => {
            const transaction = this.db!.transaction([STORE_NAME], 'readwrite');
            const store = transaction.objectStore(STORE_NAME);
            const request = store.put(entry);

            request.onsuccess = () => resolve();
            request.onerror = () => {
                console.error('Failed to save to IndexedDB');
                reject(request.error);
            };
        });
    }

    /**
     * Delete entry from IndexedDB
     */
    private async deleteFromIndexedDB(fileId: string): Promise<void> {
        if (!this.db) return;

        return new Promise((resolve, reject) => {
            const transaction = this.db!.transaction([STORE_NAME], 'readwrite');
            const store = transaction.objectStore(STORE_NAME);
            const request = store.delete(fileId);

            request.onsuccess = () => resolve();
            request.onerror = () => {
                console.error('Failed to delete from IndexedDB');
                reject(request.error);
            };
        });
    }

    /**
     * Ensure IndexedDB is initialized
     */
    private async ensureInitialized(): Promise<void> {
        if (this.dbInitPromise) {
            await this.dbInitPromise;
        }
    }

    /**
     * Index chunks for a document
     */
    async indexDocument(
        fileId: string,
        chunks: RAGChunk[],
        contentHash: string
    ): Promise<void> {
        await this.ensureInitialized();

        // Check if already indexed with same content
        const existing = this.index.get(fileId);
        if (existing && existing.contentHash === contentHash) {
            return; // Already up to date
        }

        // Generate embeddings for all chunks
        const texts = chunks.map(c => c.content);
        const embeddings = await this.embeddingService.embedBatch(texts);

        // Attach embeddings to chunks
        const indexedChunks = chunks.map((chunk, i) => ({
            ...chunk,
            embedding: embeddings[i].embedding,
        }));

        // Create index entry
        const entry: RAGIndexEntry = {
            fileId,
            chunks: indexedChunks,
            lastIndexed: Date.now(),
            contentHash,
        };

        // Store in memory
        this.index.set(fileId, entry);

        // Persist to IndexedDB
        if (this.persistToIndexedDB) {
            await this.saveToIndexedDB(entry);
        }
    }

    /**
     * Remove a document from the index
     */
    async removeDocument(fileId: string): Promise<void> {
        await this.ensureInitialized();

        this.index.delete(fileId);

        if (this.persistToIndexedDB) {
            await this.deleteFromIndexedDB(fileId);
        }
    }

    /**
     * Query the vector store for relevant chunks
     */
    async query(
        queryText: string,
        options: {
            fileIds?: string[];
            topK?: number;
            minScore?: number;
        } = {}
    ): Promise<RAGQueryResult[]> {
        await this.ensureInitialized();

        const { fileIds, topK = 5, minScore = 0.5 } = options;

        // Generate query embedding
        const queryEmbedding = await this.embeddingService.embed(queryText);

        // Collect all relevant chunks
        const candidates: { chunk: RAGChunk; score: number }[] = [];

        for (const [fid, entry] of this.index) {
            // Filter by fileIds if specified
            if (fileIds && fileIds.length > 0 && !fileIds.includes(fid)) {
                continue;
            }

            for (const chunk of entry.chunks) {
                if (!chunk.embedding) continue;

                const score = this.embeddingService.cosineSimilarity(
                    queryEmbedding,
                    chunk.embedding
                );

                if (score >= minScore) {
                    candidates.push({ chunk, score });
                }
            }
        }

        // Sort by score and take top K
        candidates.sort((a, b) => b.score - a.score);
        const topResults = candidates.slice(0, topK);

        // Format results
        return topResults.map(({ chunk, score }) => ({
            chunk,
            score,
            highlights: this.extractHighlights(chunk.content, queryText),
        }));
    }

    /**
     * Get all chunks for a document
     */
    getDocumentChunks(fileId: string): RAGChunk[] {
        const entry = this.index.get(fileId);
        return entry ? entry.chunks : [];
    }

    /**
     * Check if a document is indexed
     */
    isIndexed(fileId: string): boolean {
        return this.index.has(fileId);
    }

    /**
     * Get index entry for a document
     */
    getIndexEntry(fileId: string): RAGIndexEntry | undefined {
        return this.index.get(fileId);
    }

    /**
     * Get all indexed file IDs
     */
    getIndexedFileIds(): string[] {
        return Array.from(this.index.keys());
    }

    /**
     * Extract highlighted portions of text matching query
     */
    private extractHighlights(content: string, query: string): string[] {
        const highlights: string[] = [];
        const queryWords = query.toLowerCase().split(/\s+/).filter(w => w.length > 2);
        const sentences = content.split(/[.!?]+/);

        for (const sentence of sentences) {
            const sentenceLower = sentence.toLowerCase();
            const matchCount = queryWords.filter(w => sentenceLower.includes(w)).length;
            
            if (matchCount > 0 && sentence.trim().length > 10) {
                highlights.push(sentence.trim());
            }

            if (highlights.length >= 3) break;
        }

        return highlights;
    }

    /**
     * Get statistics about the vector store
     */
    getStats(): {
        totalDocuments: number;
        totalChunks: number;
        totalEmbeddings: number;
        estimatedMemoryMB: number;
    } {
        let totalChunks = 0;
        let totalEmbeddings = 0;
        let totalDimensions = 0;

        for (const entry of this.index.values()) {
            totalChunks += entry.chunks.length;
            for (const chunk of entry.chunks) {
                if (chunk.embedding) {
                    totalEmbeddings++;
                    totalDimensions += chunk.embedding.length;
                }
            }
        }

        return {
            totalDocuments: this.index.size,
            totalChunks,
            totalEmbeddings,
            estimatedMemoryMB: (totalDimensions * 8) / (1024 * 1024),
        };
    }

    /**
     * Clear all indexed data
     */
    async clear(): Promise<void> {
        this.index.clear();

        if (this.persistToIndexedDB && this.db) {
            return new Promise((resolve, reject) => {
                const transaction = this.db!.transaction([STORE_NAME], 'readwrite');
                const store = transaction.objectStore(STORE_NAME);
                const request = store.clear();

                request.onsuccess = () => resolve();
                request.onerror = () => reject(request.error);
            });
        }
    }
}

// Export default instance
export const defaultVectorStore = new VectorStore();
