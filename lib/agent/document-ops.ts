/**
 * Document Operations API
 * Structured functions for AI agent to interact with markdown documents
 */

import { browserStorage } from '../browser-storage';
import { 
    DocumentDiff, 
    DocumentMetadata, 
    Heading, 
    InsertPosition, 
    SearchMatch, 
    SearchResult,
    createDiff,
} from './types';

export type { InsertPosition } from './types';
import { generateHunks, determineDiffType, splitLines, joinLines } from './diff-utils';

// ==================== Read Operations ====================

/**
 * Read the full content of a document
 */
export async function readDocument(fileId: string): Promise<string> {
    return browserStorage.readFile(fileId);
}

/**
 * Read a specific section of a document by line numbers
 * @param fileId - File path/ID
 * @param startLine - 1-indexed start line (inclusive)
 * @param endLine - 1-indexed end line (inclusive)
 */
export async function readDocumentSection(
    fileId: string,
    startLine: number,
    endLine: number
): Promise<string> {
    const content = await browserStorage.readFile(fileId);
    const lines = splitLines(content);
    
    // Clamp to valid range
    const start = Math.max(1, startLine) - 1; // Convert to 0-indexed
    const end = Math.min(lines.length, endLine);
    
    return joinLines(lines.slice(start, end));
}

/**
 * Get metadata about a document
 */
export async function getDocumentMetadata(fileId: string): Promise<DocumentMetadata> {
    const content = await browserStorage.readFile(fileId);
    const lines = splitLines(content);
    const headings = findHeadingsInContent(content);
    
    // Calculate word count (split by whitespace and filter empty)
    const wordCount = content
        .split(/\s+/)
        .filter(word => word.length > 0)
        .length;
    
    return {
        fileId,
        fileName: fileId.split('/').pop() || fileId,
        lines: lines.length,
        wordCount,
        charCount: content.length,
        headings,
    };
}

// ==================== Search Operations ====================

/**
 * Find all headings in content
 */
function findHeadingsInContent(content: string): Heading[] {
    const lines = splitLines(content);
    const headings: Heading[] = [];
    const headingRegex = /^(#{1,6})\s+(.+)$/;
    
    for (let i = 0; i < lines.length; i++) {
        const match = lines[i].match(headingRegex);
        if (match) {
            const level = match[1].length as 1 | 2 | 3 | 4 | 5 | 6;
            const text = match[2].trim();
            
            // Generate a slug-style ID
            const id = text
                .toLowerCase()
                .replace(/[^\w\s-]/g, '')
                .replace(/\s+/g, '-');
            
            headings.push({
                level,
                text,
                lineNumber: i + 1, // 1-indexed
                id,
            });
        }
    }
    
    return headings;
}

/**
 * Find headings in a document
 * @param fileId - File path/ID
 * @param level - Optional: filter by heading level (1-6)
 */
export async function findHeadings(
    fileId: string,
    level?: number
): Promise<Heading[]> {
    const content = await browserStorage.readFile(fileId);
    const headings = findHeadingsInContent(content);
    
    if (level !== undefined) {
        return headings.filter(h => h.level === level);
    }
    
    return headings;
}

/**
 * Search for a pattern within a document
 * @param fileId - File path/ID
 * @param query - String or RegExp to search for
 * @param contextLines - Number of context lines to include (default: 2)
 */
export async function searchInDocument(
    fileId: string,
    query: string | RegExp,
    contextLines: number = 2
): Promise<SearchResult> {
    const content = await browserStorage.readFile(fileId);
    const lines = splitLines(content);
    const regex = typeof query === 'string' 
        ? new RegExp(escapeRegex(query), 'gi')
        : query;
    
    const matches: SearchMatch[] = [];
    
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        let match;
        
        // Reset regex lastIndex for global searches
        regex.lastIndex = 0;
        
        while ((match = regex.exec(line)) !== null) {
            const contextBefore = lines.slice(
                Math.max(0, i - contextLines),
                i
            );
            const contextAfter = lines.slice(
                i + 1,
                Math.min(lines.length, i + 1 + contextLines)
            );
            
            matches.push({
                lineNumber: i + 1, // 1-indexed
                lineContent: line,
                matchStart: match.index,
                matchEnd: match.index + match[0].length,
                context: {
                    before: contextBefore,
                    after: contextAfter,
                },
            });
            
            // For non-global regex, break after first match per line
            if (!regex.global) break;
        }
    }
    
    return {
        fileId,
        fileName: fileId.split('/').pop() || fileId,
        matches,
        totalMatches: matches.length,
    };
}

/**
 * Search across all documents
 * @param query - String or RegExp to search for
 */
export async function searchAllDocuments(
    query: string | RegExp
): Promise<SearchResult[]> {
    const { tree } = await browserStorage.list();
    const results: SearchResult[] = [];
    
    // Recursively collect all file IDs
    const fileIds: string[] = [];
    const collectFiles = (nodes: typeof tree) => {
        for (const node of nodes) {
            if (node.type === 'file') {
                fileIds.push(node.id);
            } else if (node.children) {
                collectFiles(node.children);
            }
        }
    };
    collectFiles(tree);
    
    // Search each file
    for (const fileId of fileIds) {
        try {
            const result = await searchInDocument(fileId, query);
            if (result.totalMatches > 0) {
                results.push(result);
            }
        } catch (err) {
            // Skip files that can't be read
            console.warn(`Could not search file ${fileId}:`, err);
        }
    }
    
    return results;
}

// ==================== Edit Operations ====================

/**
 * Propose an edit by finding and replacing text
 * @param fileId - File path/ID
 * @param oldText - Text to find and replace
 * @param newText - Replacement text
 * @param description - Description of the change
 */
export async function proposeEdit(
    fileId: string,
    oldText: string,
    newText: string,
    description?: string
): Promise<DocumentDiff | null> {
    const content = await browserStorage.readFile(fileId);
    
    if (!content.includes(oldText)) {
        return null; // Text not found
    }
    
    const newContent = content.replace(oldText, newText);
    const hunks = generateHunks(content, newContent);
    const type = determineDiffType(hunks);
    const fileName = fileId.split('/').pop() || fileId;
    
    return createDiff(
        fileId,
        fileName,
        type,
        content,
        newContent,
        hunks,
        description || `Replace "${truncate(oldText, 30)}" with "${truncate(newText, 30)}"`
    );
}

/**
 * Propose inserting content at a specific position
 */
export async function proposeInsert(
    fileId: string,
    position: InsertPosition,
    contentToInsert: string,
    description?: string
): Promise<DocumentDiff | null> {
    const content = await browserStorage.readFile(fileId);
    const lines = splitLines(content);
    let insertIndex: number;
    
    switch (position.type) {
        case 'start':
            insertIndex = 0;
            break;
        
        case 'end':
            insertIndex = lines.length;
            break;
        
        case 'line':
            // Insert before the specified line (1-indexed)
            insertIndex = Math.max(0, Math.min(lines.length, position.lineNumber - 1));
            break;
        
        case 'afterHeading': {
            const headings = findHeadingsInContent(content);
            const heading = headings.find(h => 
                h.text.toLowerCase().includes(position.headingText.toLowerCase())
            );
            
            if (!heading) {
                return null; // Heading not found
            }
            
            // Insert after the heading line
            insertIndex = heading.lineNumber; // Already 1-indexed, so this is correct for "after"
            break;
        }
        
        default:
            return null;
    }
    
    // Insert the new content
    const newLines = [...lines];
    const insertLines = splitLines(contentToInsert);
    newLines.splice(insertIndex, 0, ...insertLines);
    
    const newContent = joinLines(newLines);
    const hunks = generateHunks(content, newContent);
    const fileName = fileId.split('/').pop() || fileId;
    
    return createDiff(
        fileId,
        fileName,
        'insert',
        content,
        newContent,
        hunks,
        description || `Insert ${insertLines.length} line(s)`
    );
}

/**
 * Propose deleting lines from a document
 * @param fileId - File path/ID
 * @param startLine - 1-indexed start line (inclusive)
 * @param endLine - 1-indexed end line (inclusive)
 */
export async function proposeDelete(
    fileId: string,
    startLine: number,
    endLine: number,
    description?: string
): Promise<DocumentDiff | null> {
    const content = await browserStorage.readFile(fileId);
    const lines = splitLines(content);
    
    // Validate range
    if (startLine < 1 || endLine > lines.length || startLine > endLine) {
        return null;
    }
    
    // Remove the specified lines
    const newLines = [...lines];
    newLines.splice(startLine - 1, endLine - startLine + 1);
    
    const newContent = joinLines(newLines);
    const hunks = generateHunks(content, newContent);
    const fileName = fileId.split('/').pop() || fileId;
    
    return createDiff(
        fileId,
        fileName,
        'delete',
        content,
        newContent,
        hunks,
        description || `Delete lines ${startLine}-${endLine}`
    );
}

/**
 * Normalize heading text for flexible matching (strip leading "N." or "N)" numbering).
 */
function normalizeHeadingForMatch(text: string): string {
    return text
        .trim()
        .toLowerCase()
        .replace(/^\d+[.)]\s*/, '') // "6. " or "6) "
        .trim();
}

/**
 * Check if a document heading matches the requested sectionHeading (flexible).
 */
function headingMatchesSection(headingText: string, sectionHeading: string): boolean {
    const h = normalizeHeadingForMatch(headingText);
    const s = normalizeHeadingForMatch(sectionHeading);
    if (!h || !s) return headingText.toLowerCase().trim() === sectionHeading.toLowerCase().trim();
    return h === s || h.includes(s) || s.includes(h);
}

/**
 * Propose replacing an entire section (from heading to next heading or end)
 * @param fileId - File path/ID
 * @param sectionHeading - Text of the heading to find (e.g. "Conclusion" or "6. Conclusion")
 * @param newContent - New content for the section (including the heading)
 */
export async function proposeReplaceSection(
    fileId: string,
    sectionHeading: string,
    newSectionContent: string,
    description?: string
): Promise<DocumentDiff | null> {
    const content = await browserStorage.readFile(fileId);
    const headings = findHeadingsInContent(content);
    const lines = splitLines(content);
    
    // Find the target heading (flexible match: "Conclusion" matches "6. Conclusion", etc.)
    const headingIndex = headings.findIndex(h =>
        headingMatchesSection(h.text, sectionHeading)
    );
    
    if (headingIndex === -1) {
        return null; // Heading not found
    }
    
    const startHeading = headings[headingIndex];
    const startLine = startHeading.lineNumber - 1; // Convert to 0-indexed
    
    // Find the end of the section (next heading of same or higher level, or end of document)
    let endLine = lines.length;
    for (let i = headingIndex + 1; i < headings.length; i++) {
        if (headings[i].level <= startHeading.level) {
            endLine = headings[i].lineNumber - 1; // Line before next heading
            break;
        }
    }
    
    // Replace the section
    const newLines = [...lines];
    const insertLines = splitLines(newSectionContent);
    newLines.splice(startLine, endLine - startLine, ...insertLines);
    
    const newContent = joinLines(newLines);
    const hunks = generateHunks(content, newContent);
    const fileName = fileId.split('/').pop() || fileId;
    
    return createDiff(
        fileId,
        fileName,
        'replace',
        content,
        newContent,
        hunks,
        description || `Replace section "${truncate(sectionHeading, 30)}"`
    );
}

/**
 * Propose a full document replacement
 */
export async function proposeFullReplace(
    fileId: string,
    newContent: string,
    description?: string
): Promise<DocumentDiff> {
    const content = await browserStorage.readFile(fileId);
    const hunks = generateHunks(content, newContent);
    const type = determineDiffType(hunks);
    const fileName = fileId.split('/').pop() || fileId;
    
    return createDiff(
        fileId,
        fileName,
        type,
        content,
        newContent,
        hunks,
        description || 'Replace document content'
    );
}

// ==================== Utility Functions ====================

/**
 * Escape special regex characters in a string
 */
function escapeRegex(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Truncate a string with ellipsis
 */
function truncate(str: string, maxLength: number): string {
    if (str.length <= maxLength) return str;
    return str.slice(0, maxLength - 3) + '...';
}

// ==================== Export All ====================

export const documentOps = {
    // Read
    readDocument,
    readDocumentSection,
    getDocumentMetadata,
    
    // Search
    findHeadings,
    searchInDocument,
    searchAllDocuments,
    
    // Edit (propose)
    proposeEdit,
    proposeInsert,
    proposeDelete,
    proposeReplaceSection,
    proposeFullReplace,
};
