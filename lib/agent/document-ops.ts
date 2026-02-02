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

export interface SectionNode {
    text: string;
    level: number;
    lineNumber: number;
    endLine: number;
    children: SectionNode[];
}

// ==================== Read Operations ====================

/**
 * Read the full content of a document
 */
export async function readDocument(fileId: string, contentOverride?: string): Promise<string> {
    if (contentOverride !== undefined) return contentOverride;
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
    endLine: number,
    contentOverride?: string
): Promise<string> {
    const content = await readDocument(fileId, contentOverride);
    const lines = splitLines(content);

    // Clamp to valid range
    const start = Math.max(1, startLine) - 1; // Convert to 0-indexed
    const end = Math.min(lines.length, endLine);

    return joinLines(lines.slice(start, end));
}

/**
 * Get metadata about a document
 */
export async function getDocumentMetadata(fileId: string, contentOverride?: string): Promise<DocumentMetadata> {
    const content = await readDocument(fileId, contentOverride);
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
    level?: number,
    contentOverride?: string
): Promise<Heading[]> {
    const content = await readDocument(fileId, contentOverride);
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
    contextLines: number = 2,
    contentOverride?: string
): Promise<SearchResult> {
    const content = await readDocument(fileId, contentOverride);
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
    description?: string,
    contentOverride?: string
): Promise<DocumentDiff | null> {
    const content = await readDocument(fileId, contentOverride);

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
    description?: string,
    contentOverride?: string
): Promise<DocumentDiff | null> {
    const content = await readDocument(fileId, contentOverride);
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
    description?: string,
    contentOverride?: string
): Promise<DocumentDiff | null> {
    const content = await readDocument(fileId, contentOverride);
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
    description?: string,
    contentOverride?: string
): Promise<DocumentDiff | null> {
    const content = await readDocument(fileId, contentOverride);
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

/**
 * Get the hierarchical structure of a document
 */
export async function getDocumentStructure(fileId: string, contentOverride?: string): Promise<SectionNode[]> {
    const content = await readDocument(fileId, contentOverride);
    const headings = findHeadingsInContent(content);
    const lines = splitLines(content);

    // Build tree
    const root: SectionNode[] = [];
    const stack: SectionNode[] = []; // Stack of active parents

    for (let i = 0; i < headings.length; i++) {
        const h = headings[i];

        // Determine end line
        let endLine = lines.length;
        if (i < headings.length - 1) {
            endLine = headings[i + 1].lineNumber - 1;
        }

        const node: SectionNode = {
            text: h.text,
            level: h.level,
            lineNumber: h.lineNumber,
            endLine,
            children: []
        };

        while (stack.length > 0 && stack[stack.length - 1].level >= node.level) {
            stack.pop();
        }

        if (stack.length === 0) {
            root.push(node);
        } else {
            stack[stack.length - 1].children.push(node);
        }

        stack.push(node);
    }

    return root;
}

/**
 * Find the index of the Nth occurrence of a heading matching sectionHeading (1-based).
 */
function findHeadingOccurrenceIndex(headings: Array<{ text: string; level: number; lineNumber: number }>, sectionHeading: string, occurrenceIndex: number): number {
    let count = 0;
    for (let i = 0; i < headings.length; i++) {
        if (headingMatchesSection(headings[i].text, sectionHeading)) {
            count++;
            if (count === occurrenceIndex) return i;
        }
    }
    return -1;
}

/**
 * Propose updating a specific section's content
 * @param fileId - File path/ID
 * @param sectionHeading - Heading text to find
 * @param newContent - New content for the section (including the heading if desired, usually yes)
 * @param description - Optional description
 * @param occurrenceIndex - 1-based; when the same heading appears multiple times, which occurrence to update (default 1)
 */
export async function proposeUpdateSection(
    fileId: string,
    sectionHeading: string,
    newContent: string,
    description?: string,
    occurrenceIndex: number = 1,
    contentOverride?: string
): Promise<DocumentDiff | null> {
    const content = await readDocument(fileId, contentOverride);
    const headings = findHeadingsInContent(content);
    const lines = splitLines(content);

    const headingIndex = occurrenceIndex <= 1
        ? headings.findIndex(h => headingMatchesSection(h.text, sectionHeading))
        : findHeadingOccurrenceIndex(headings, sectionHeading, occurrenceIndex);

    if (headingIndex === -1) return null;

    const heading = headings[headingIndex];
    let endLine = lines.length;
    for (let i = headingIndex + 1; i < headings.length; i++) {
        if (headings[i].level <= heading.level) {
            endLine = headings[i].lineNumber - 1;
            break;
        }
    }

    const startLine = heading.lineNumber - 1; // 0-indexed

    const newLines = [...lines];
    const insertLines = splitLines(newContent);
    newLines.splice(startLine, endLine - startLine, ...insertLines);

    const finalContent = joinLines(newLines);
    const hunks = generateHunks(content, finalContent);
    const fileName = fileId.split('/').pop() || fileId;

    return createDiff(
        fileId,
        fileName,
        'replace',
        content,
        finalContent,
        hunks,
        description || `Update section "${truncate(sectionHeading, 30)}"`
    );
}

/**
 * Propose adding a new section relative to another
 */
export async function proposeAddSection(
    fileId: string,
    targetHeading: string,
    relation: 'before' | 'after',
    newContent: string,
    description?: string,
    contentOverride?: string
): Promise<DocumentDiff | null> {
    const content = await readDocument(fileId, contentOverride);
    const headings = findHeadingsInContent(content);
    const lines = splitLines(content);

    const headingIndex = headings.findIndex(h =>
        headingMatchesSection(h.text, targetHeading)
    );

    if (headingIndex === -1) return null;
    const heading = headings[headingIndex];

    let insertLine = 0;

    if (relation === 'before') {
        insertLine = heading.lineNumber - 1; // 0-indexed line of heading
    } else {
        // After this section (skip all children)
        let endLine = lines.length;
        for (let i = headingIndex + 1; i < headings.length; i++) {
            if (headings[i].level <= heading.level) {
                endLine = headings[i].lineNumber - 1;
                break;
            }
        }
        insertLine = endLine;
    }

    const newLines = [...lines];
    const insertLines = splitLines(newContent);

    // Ensure newline separation padding
    if (insertLines.length > 0) {
        insertLines.push(''); // Add trailing newline for spacing
        if (insertLine > 0 && newLines[insertLine - 1] && newLines[insertLine - 1].trim() !== '') {
            insertLines.unshift('');
        }
    }

    newLines.splice(insertLine, 0, ...insertLines);

    const finalContent = joinLines(newLines);
    const hunks = generateHunks(content, finalContent);
    const fileName = fileId.split('/').pop() || fileId;

    return createDiff(
        fileId,
        fileName,
        'insert',
        content,
        finalContent,
        hunks,
        description || `Add section ${relation} "${truncate(targetHeading, 30)}"`
    );
}

/**
 * Propose removing a section
 * @param occurrenceIndex - 1-based; when the same heading appears multiple times (duplicates), which occurrence to remove (default 1)
 */
export async function proposeRemoveSection(
    fileId: string,
    sectionHeading: string,
    description?: string,
    occurrenceIndex: number = 1,
    contentOverride?: string
): Promise<DocumentDiff | null> {
    return proposeUpdateSection(fileId, sectionHeading, "", description || `Remove section "${truncate(sectionHeading, 30)}"`, occurrenceIndex, contentOverride);
}

/**
 * Propose moving a section
 */
export async function proposeMoveSection(
    fileId: string,
    sectionHeading: string,
    targetHeading: string,
    relation: 'before' | 'after',
    description?: string,
    contentOverride?: string
): Promise<DocumentDiff | null> {
    const content = await readDocument(fileId, contentOverride);
    const headings = findHeadingsInContent(content);
    const lines = splitLines(content);

    // 1. Identify source range
    const sourceIdx = headings.findIndex(h => headingMatchesSection(h.text, sectionHeading));
    if (sourceIdx === -1) return null;
    const sourceHeading = headings[sourceIdx];

    let sourceEnd = lines.length;
    for (let i = sourceIdx + 1; i < headings.length; i++) {
        if (headings[i].level <= sourceHeading.level) {
            sourceEnd = headings[i].lineNumber - 1;
            break;
        }
    }
    const sourceStart = sourceHeading.lineNumber - 1;

    // 2. Identify target insertion point
    const targetIdx = headings.findIndex(h => headingMatchesSection(h.text, targetHeading));
    if (targetIdx === -1) return null;
    const targetHeadingObj = headings[targetIdx];

    // Check nested move
    if (targetHeadingObj.lineNumber >= sourceHeading.lineNumber && targetHeadingObj.lineNumber < sourceEnd) {
        return null; // Target is inside source
    }

    let insertAt = 0;
    if (relation === 'before') {
        insertAt = targetHeadingObj.lineNumber - 1;
    } else {
        let targetEnd = lines.length;
        for (let i = targetIdx + 1; i < headings.length; i++) {
            if (headings[i].level <= targetHeadingObj.level) {
                targetEnd = headings[i].lineNumber - 1;
                break;
            }
        }
        insertAt = targetEnd;
    }

    const newLines = [...lines];
    const sectionLines = lines.slice(sourceStart, sourceEnd);

    // Remove source
    newLines.splice(sourceStart, sourceEnd - sourceStart);

    // Adjust insertAt
    let finalInsertAt = insertAt;
    if (insertAt > sourceStart) {
        finalInsertAt -= (sourceEnd - sourceStart);
    }

    // Insert
    newLines.splice(finalInsertAt, 0, ...sectionLines);

    const finalContent = joinLines(newLines);
    const hunks = generateHunks(content, finalContent);
    const fileName = fileId.split('/').pop() || fileId;

    return createDiff(
        fileId,
        fileName,
        'replace',
        content,
        finalContent,
        hunks,
        description || `Move section "${truncate(sectionHeading, 30)}" ${relation} "${truncate(targetHeading, 30)}"`
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
    getDocumentStructure,
    proposeUpdateSection,
    proposeAddSection,
    proposeRemoveSection,
    proposeMoveSection,
};
