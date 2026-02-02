/**
 * Optimized Markdown Processor with Caching, Chunking, and Differential Processing
 * 
 * This module provides high-performance markdown deserialization for large documents
 * by implementing:
 * 1. Content caching with hash-based invalidation
 * 2. Chunked processing to avoid blocking the main thread
 * 3. Differential processing to only re-process changed sections
 */

import { KEYS } from 'platejs';
import { createPlateEditor } from 'platejs/react';
import { EditorKit } from '@/components/plate-editor/editor-kit';
import { KEY_PLACEHOLDER } from '@/components/plate-editor/plugins/placeholder-kit';
import { parsePlaceholderToken, preprocessMathDelimiters } from '@/components/plate-editor/plugins/markdown-kit';

// Type for cached chunk data
interface CachedChunk {
    markdown: string;
    hash: string;
    nodes: any[];
}

interface ContentCache {
    fullMarkdown: string;
    fullHash: string;
    chunks: CachedChunk[];
    lastNodes: any[];
}

// Simple hash function for content comparison
function hashString(str: string): string {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        const char = str.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash; // Convert to 32bit integer
    }
    return hash.toString(36);
}

const PLACEHOLDER_REGEX = /\{\{([^}]+)\}\}/g;

function splitTextWithPlaceholders(value: string): Array<{ type: 'text'; text: string } | ({ type: 'placeholder' } & Record<string, unknown>)> {
    const parts: Array<{ type: 'text'; text: string } | ({ type: 'placeholder' } & Record<string, unknown>)> = [];
    let lastIndex = 0;
    let match: RegExpExecArray | null;

    PLACEHOLDER_REGEX.lastIndex = 0;
    while ((match = PLACEHOLDER_REGEX.exec(value)) !== null) {
        const start = match.index;
        const end = start + match[0].length;
        const rawToken = match[1];

        if (start > lastIndex) {
            parts.push({ type: 'text', text: value.slice(lastIndex, start) });
        }

        const parsed = parsePlaceholderToken(rawToken);
        if (parsed) {
            parts.push({ type: 'placeholder', ...parsed });
        } else {
            parts.push({ type: 'text', text: match[0] });
        }

        lastIndex = end;
    }

    if (lastIndex < value.length) {
        parts.push({ type: 'text', text: value.slice(lastIndex) });
    }

    return parts;
}

function normalizePlaceholdersInNodes(nodes: any[], inCodeBlock = false): any[] {
    const normalized: any[] = [];

    for (const node of nodes) {
        const transformed = normalizePlaceholdersInNode(node, inCodeBlock);
        if (Array.isArray(transformed)) {
            normalized.push(...transformed);
        } else {
            normalized.push(transformed);
        }
    }

    return normalized;
}

function normalizePlaceholdersInNode(node: any, inCodeBlock: boolean): any | any[] {
    if (!node || typeof node !== 'object') return node;

    if (node.type === KEY_PLACEHOLDER) {
        return node;
    }

    const isCodeContext = inCodeBlock || node.type === KEYS.codeBlock || node.type === KEYS.codeLine;

    if (typeof node.text === 'string') {
        if (isCodeContext || node.code) {
            return node;
        }

        const parts = splitTextWithPlaceholders(node.text);
        if (parts.length === 1 && parts[0].type === 'text') {
            return node;
        }

        const { text: _text, ...marks } = node;
        return parts.map((part) => {
            if (part.type === 'text') {
                return { ...marks, text: part.text };
            }
            const { type: _type, ...parsed } = part;
            return {
                type: KEY_PLACEHOLDER,
                children: [{ text: '' }],
                ...parsed,
            };
        });
    }

    if (Array.isArray(node.children)) {
        const children = normalizePlaceholdersInNodes(node.children, isCodeContext);
        return { ...node, children };
    }

    return node;
}

// Split markdown into semantic chunks (by headers or significant blocks)
function splitIntoChunks(markdown: string): string[] {
    if (!markdown) return [''];

    const lines = markdown.split('\n');
    const chunks: string[] = [];
    let currentChunk: string[] = [];

    // Chunk by headers (h1, h2, h3) or by size threshold
    const CHUNK_SIZE_THRESHOLD = 2000; // characters

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const isHeader = /^#{1,3}\s/.test(line);
        const currentChunkText = currentChunk.join('\n');

        // Start a new chunk if:
        // 1. We hit a major header (h1-h3), OR
        // 2. Current chunk exceeds threshold and we hit any header
        if (
            (isHeader && currentChunk.length > 0) ||
            (currentChunkText.length > CHUNK_SIZE_THRESHOLD && /^#{1,6}\s/.test(line))
        ) {
            if (currentChunk.length > 0) {
                chunks.push(currentChunk.join('\n'));
            }
            currentChunk = [line];
        } else {
            currentChunk.push(line);
        }
    }

    // Don't forget the last chunk
    if (currentChunk.length > 0) {
        chunks.push(currentChunk.join('\n'));
    }

    return chunks.length > 0 ? chunks : [''];
}

// The main cache instance
let contentCache: ContentCache | null = null;

// Create a temporary editor for deserialization
function createTempEditor() {
    return createPlateEditor({ plugins: EditorKit });
}

/**
 * Deserialize a single chunk of markdown
 */
function deserializeChunk(chunk: string, tempEditor: any): any[] {
    try {
        const preprocessed = preprocessMathDelimiters(chunk);
        const nodes = tempEditor.api.markdown.deserialize(preprocessed);
        return normalizePlaceholdersInNodes(nodes);
    } catch (e) {
        console.error('Error deserializing chunk:', e);
        // Return a simple paragraph with the raw text on error
        return [{ type: 'p', children: [{ text: chunk }] }];
    }
}

/**
 * Process markdown with differential updates
 * Returns the new nodes array, only processing chunks that changed
 */
function processWithDiff(
    newMarkdown: string,
    tempEditor: any
): { nodes: any[]; unchanged: boolean } {
    const startTime = performance.now();
    console.log('[MarkdownProcessor] processWithDiff started', {
        contentLength: newMarkdown.length,
        hasCachedData: !!contentCache
    });

    const chunkStart = performance.now();
    const newChunks = splitIntoChunks(newMarkdown);
    console.log('[MarkdownProcessor] splitIntoChunks', {
        chunkCount: newChunks.length,
        chunkTime: performance.now() - chunkStart
    });

    // If no cache or structure changed significantly, do full reprocess
    if (!contentCache || Math.abs(contentCache.chunks.length - newChunks.length) > 2) {
        console.log('[MarkdownProcessor] Full reprocess needed (no cache or structure change)');
        const allNodes: any[] = [];
        const cachedChunks: CachedChunk[] = [];

        for (let i = 0; i < newChunks.length; i++) {
            const chunk = newChunks[i];
            const hash = hashString(chunk);
            const deserializeStart = performance.now();
            const nodes = deserializeChunk(chunk, tempEditor);
            if (i < 3 || i === newChunks.length - 1) {
                console.log(`[MarkdownProcessor] Chunk ${i} deserialized`, {
                    deserializeTime: performance.now() - deserializeStart,
                    nodeCount: nodes.length
                });
            }
            allNodes.push(...nodes);
            cachedChunks.push({ markdown: chunk, hash, nodes });
        }

        contentCache = {
            fullMarkdown: newMarkdown,
            fullHash: hashString(newMarkdown),
            chunks: cachedChunks,
            lastNodes: allNodes,
        };

        console.log('[MarkdownProcessor] processWithDiff completed (full)', {
            totalTime: performance.now() - startTime,
            totalNodes: allNodes.length
        });
        return { nodes: allNodes, unchanged: false };
    }

    // Check if content is exactly the same
    const hashStart = performance.now();
    const newFullHash = hashString(newMarkdown);
    console.log('[MarkdownProcessor] Hash comparison', {
        hashTime: performance.now() - hashStart,
        cacheMatch: contentCache.fullHash === newFullHash
    });

    if (contentCache.fullHash === newFullHash) {
        console.log('[MarkdownProcessor] processWithDiff completed (unchanged)', {
            totalTime: performance.now() - startTime,
            cachedNodes: contentCache.lastNodes.length
        });
        return { nodes: contentCache.lastNodes, unchanged: true };
    }

    // Differential update: only reprocess changed chunks
    const allNodes: any[] = [];
    const newCachedChunks: CachedChunk[] = [];
    let hasChanges = false;
    let reusedChunks = 0;
    let reprocessedChunks = 0;

    for (let i = 0; i < newChunks.length; i++) {
        const chunk = newChunks[i];
        const newHash = hashString(chunk);

        // Check if this chunk matches a cached chunk
        const cachedChunk = contentCache.chunks[i];

        if (cachedChunk && cachedChunk.hash === newHash) {
            // Reuse cached nodes
            allNodes.push(...cachedChunk.nodes);
            newCachedChunks.push(cachedChunk);
            reusedChunks++;
        } else {
            // Need to reprocess this chunk
            hasChanges = true;
            const nodes = deserializeChunk(chunk, tempEditor);
            allNodes.push(...nodes);
            newCachedChunks.push({ markdown: chunk, hash: newHash, nodes });
            reprocessedChunks++;
        }
    }

    // Update cache
    contentCache = {
        fullMarkdown: newMarkdown,
        fullHash: newFullHash,
        chunks: newCachedChunks,
        lastNodes: allNodes,
    };

    console.log('[MarkdownProcessor] processWithDiff completed (diff)', {
        totalTime: performance.now() - startTime,
        reusedChunks,
        reprocessedChunks,
        totalNodes: allNodes.length,
        hasChanges
    });
    return { nodes: allNodes, unchanged: !hasChanges };
}

/**
 * Process large markdown content in chunks with progress callback
 */
export async function processMarkdownChunked(
    markdown: string,
    onProgress?: (progress: number) => void
): Promise<any[]> {
    const tempEditor = createTempEditor();
    const chunks = splitIntoChunks(markdown);
    const allNodes: any[] = [];
    const cachedChunks: CachedChunk[] = [];

    // Process chunks with yielding to main thread
    for (let i = 0; i < chunks.length; i++) {
        const chunk = chunks[i];
        const hash = hashString(chunk);

        // Check if we have this chunk cached
        const cachedChunk = contentCache?.chunks.find(c => c.hash === hash);

        if (cachedChunk) {
            allNodes.push(...cachedChunk.nodes);
            cachedChunks.push(cachedChunk);
        } else {
            const nodes = deserializeChunk(chunk, tempEditor);
            allNodes.push(...nodes);
            cachedChunks.push({ markdown: chunk, hash, nodes });
        }

        // Report progress and yield to main thread every few chunks
        if (onProgress) {
            onProgress(((i + 1) / chunks.length) * 100);
        }

        // Yield to main thread every 3 chunks to keep UI responsive
        if (i % 3 === 0 && i > 0) {
            await new Promise(resolve => setTimeout(resolve, 0));
        }
    }

    // Update cache
    contentCache = {
        fullMarkdown: markdown,
        fullHash: hashString(markdown),
        chunks: cachedChunks,
        lastNodes: allNodes,
    };

    return allNodes;
}

/**
 * Synchronous differential markdown processing
 * Fast path for small-medium documents or when changes are minimal
 */
export function processMarkdownDiff(markdown: string): { nodes: any[]; unchanged: boolean } {
    const startTime = performance.now();
    
    // FAST PATH: Check cache validity BEFORE creating the expensive temp editor
    // This avoids the ~15ms cost of createPlateEditor when cache is valid
    if (contentCache) {
        const newHash = hashString(markdown);
        if (contentCache.fullHash === newHash) {
            console.log('[MarkdownProcessor] processMarkdownDiff cache hit (fast path)', {
                totalTime: performance.now() - startTime,
                cachedNodes: contentCache.lastNodes.length
            });
            return { nodes: contentCache.lastNodes, unchanged: true };
        }
    }

    console.log('[MarkdownProcessor] processMarkdownDiff started (cache miss)');

    const editorCreateStart = performance.now();
    const tempEditor = createTempEditor();
    console.log('[MarkdownProcessor] createTempEditor', {
        createTime: performance.now() - editorCreateStart
    });

    const result = processWithDiff(markdown, tempEditor);
    console.log('[MarkdownProcessor] processMarkdownDiff completed', {
        totalTime: performance.now() - startTime
    });
    return result;
}

/**
 * Check if the content has significantly changed
 * Returns true if we need to do a full reprocess
 */
export function hasSignificantChange(newMarkdown: string): boolean {
    const startTime = performance.now();

    if (!contentCache) {
        console.log('[MarkdownProcessor] hasSignificantChange: no cache', {
            time: performance.now() - startTime
        });
        return true;
    }

    const newHash = hashString(newMarkdown);
    if (contentCache.fullHash === newHash) {
        console.log('[MarkdownProcessor] hasSignificantChange: hash match (no change)', {
            time: performance.now() - startTime
        });
        return false;
    }

    // Check chunk-level changes
    const newChunks = splitIntoChunks(newMarkdown);
    if (Math.abs(newChunks.length - contentCache.chunks.length) > 2) {
        console.log('[MarkdownProcessor] hasSignificantChange: chunk count changed significantly', {
            time: performance.now() - startTime,
            oldChunks: contentCache.chunks.length,
            newChunks: newChunks.length
        });
        return true;
    }

    // Count how many chunks changed
    let changedChunks = 0;
    for (let i = 0; i < Math.min(newChunks.length, contentCache.chunks.length); i++) {
        const newHash = hashString(newChunks[i]);
        if (!contentCache.chunks[i] || contentCache.chunks[i].hash !== newHash) {
            changedChunks++;
        }
    }

    // Consider significant if more than 30% of chunks changed
    const changeRatio = changedChunks / contentCache.chunks.length;
    const isSignificant = changeRatio > 0.3;

    console.log('[MarkdownProcessor] hasSignificantChange result', {
        time: performance.now() - startTime,
        changedChunks,
        totalChunks: contentCache.chunks.length,
        changeRatio,
        isSignificant
    });
    return isSignificant;
}

/**
 * Clear the markdown processor cache
 */
export function clearMarkdownCache(): void {
    contentCache = null;
}

/**
 * Get cache statistics for debugging
 */
export function getCacheStats(): { chunks: number; totalSize: number } | null {
    if (!contentCache) return null;
    return {
        chunks: contentCache.chunks.length,
        totalSize: contentCache.fullMarkdown.length,
    };
}

/**
 * Warm up the cache with initial content
 * Call this when first loading a document
 */
export function warmupCache(markdown: string): void {
    const tempEditor = createTempEditor();
    processWithDiff(markdown, tempEditor);
}

/**
 * Update cache with content that was serialized from the editor
 * This keeps the cache in sync when content is edited in WYSIWYG mode
 * Call this after serializing from Plate to markdown
 */
export function updateCacheFromMarkdown(markdown: string, nodes: any[]): void {
    if (!markdown) {
        contentCache = null;
        return;
    }

    const chunks = splitIntoChunks(markdown);
    const cachedChunks: CachedChunk[] = [];

    // We don't have per-chunk nodes from the editor, so we'll store
    // the full markdown and nodes for future comparison
    for (const chunk of chunks) {
        cachedChunks.push({
            markdown: chunk,
            hash: hashString(chunk),
            nodes: [], // Empty - will be populated on next deserialization
        });
    }

    contentCache = {
        fullMarkdown: markdown,
        fullHash: hashString(markdown),
        chunks: cachedChunks,
        lastNodes: nodes,
    };
}

/**
 * Check if cache is valid for the given content
 */
export function isCacheValid(markdown: string): boolean {
    if (!contentCache) return false;
    return contentCache.fullHash === hashString(markdown);
}
