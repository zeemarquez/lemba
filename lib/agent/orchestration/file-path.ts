/**
 * File path resolution for orchestration tools and RAG.
 * Resolves partial paths or filenames to the actual storage path used in IndexedDB.
 */

import { browserStorage } from '../../browser-storage';

type TreeNode = { id: string; type: string; children?: TreeNode[] };

/** Collect all file paths from the storage tree */
export async function getAllFilePaths(): Promise<string[]> {
    const { tree } = await browserStorage.list();
    const paths: string[] = [];
    function collect(nodes: TreeNode[]) {
        for (const node of nodes) {
            if (node.type === 'file') paths.push(node.id);
            else if (node.children) collect(node.children);
        }
    }
    collect(tree as TreeNode[]);
    return paths;
}

/**
 * Resolve a fileId (which may be a full path or just a filename) to the actual storage path.
 * Storage uses full paths like "preloaded/Welcome.md" or "Files/document.md".
 * The LLM or callers may pass only "Welcome.md" or "document.md".
 */
export async function resolveFilePath(fileId: string): Promise<string | null> {
    if (!fileId || typeof fileId !== 'string') return null;
    const trimmed = fileId.trim();
    if (!trimmed) return null;

    // 1. Exact match: try as-is first
    try {
        await browserStorage.readFile(trimmed);
        return trimmed;
    } catch {
        // Not found, try to resolve
    }

    // 2. Resolve using list of all files
    const allPaths = await getAllFilePaths();
    const exact = allPaths.find(p => p === trimmed);
    if (exact) return exact;

    // 3. Match by path ending (e.g. "Welcome.md" -> "preloaded/Welcome.md")
    const byEnding = allPaths.find(p => p === trimmed || p.endsWith('/' + trimmed) || p.endsWith(trimmed));
    if (byEnding) return byEnding;

    // 4. Match by filename only (last segment)
    const fileName = trimmed.split('/').pop() || trimmed;
    const byFileName = allPaths.find(p => p.split('/').pop() === fileName);
    if (byFileName) return byFileName;

    return null;
}

/** Resolve fileId or throw with a clear error */
export async function requireFilePath(fileId: string): Promise<string> {
    const resolved = await resolveFilePath(fileId);
    if (resolved) return resolved;
    throw new Error(`File not found: "${fileId}". Use the full path (e.g. preloaded/Welcome.md) or the exact filename.`);
}

/**
 * Resolve fileId, falling back to defaultFileId when the agent invents a wrong path.
 * Use when the conversation has a single target file (e.g. the open document).
 */
export async function requireFilePathWithDefault(
    fileId: string,
    defaultFileId?: string | null
): Promise<string> {
    const resolved = await resolveFilePath(fileId);
    if (resolved) return resolved;
    if (defaultFileId) {
        const fallback = await resolveFilePath(defaultFileId);
        if (fallback) return fallback;
    }
    throw new Error(`File not found: "${fileId}". Use the full path (e.g. preloaded/Welcome.md) or the exact filename.`);
}
