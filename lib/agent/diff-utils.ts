/**
 * Diff Utilities
 * Functions for generating, applying, and displaying diffs
 */

import { DocumentDiff, DiffHunk, DiffType, createDiff } from './types';

// ==================== Diff Generation ====================

/**
 * Split content into lines, preserving empty lines
 */
export function splitLines(content: string): string[] {
    return content.split('\n');
}

/**
 * Join lines back into content
 */
export function joinLines(lines: string[]): string {
    return lines.join('\n');
}

/**
 * Find the longest common subsequence between two arrays of lines
 * Returns indices of matching lines in both arrays
 */
function lcs(oldLines: string[], newLines: string[]): { oldIdx: number; newIdx: number }[] {
    const m = oldLines.length;
    const n = newLines.length;
    
    // Build LCS table
    const dp: number[][] = Array(m + 1).fill(null).map(() => Array(n + 1).fill(0));
    
    for (let i = 1; i <= m; i++) {
        for (let j = 1; j <= n; j++) {
            if (oldLines[i - 1] === newLines[j - 1]) {
                dp[i][j] = dp[i - 1][j - 1] + 1;
            } else {
                dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
            }
        }
    }
    
    // Backtrack to find the actual LCS
    const result: { oldIdx: number; newIdx: number }[] = [];
    let i = m, j = n;
    
    while (i > 0 && j > 0) {
        if (oldLines[i - 1] === newLines[j - 1]) {
            result.unshift({ oldIdx: i - 1, newIdx: j - 1 });
            i--;
            j--;
        } else if (dp[i - 1][j] > dp[i][j - 1]) {
            i--;
        } else {
            j--;
        }
    }
    
    return result;
}

/**
 * Generate diff hunks between old and new content
 */
export function generateHunks(oldContent: string, newContent: string): DiffHunk[] {
    const oldLines = splitLines(oldContent);
    const newLines = splitLines(newContent);
    
    const commonLines = lcs(oldLines, newLines);
    const hunks: DiffHunk[] = [];
    
    let oldIdx = 0;
    let newIdx = 0;
    
    for (const match of commonLines) {
        // Check if there are differences before this common line
        if (oldIdx < match.oldIdx || newIdx < match.newIdx) {
            hunks.push({
                startLine: oldIdx + 1, // 1-indexed
                endLine: match.oldIdx, // 1-indexed (exclusive becomes inclusive-1)
                oldLines: oldLines.slice(oldIdx, match.oldIdx),
                newLines: newLines.slice(newIdx, match.newIdx),
            });
        }
        
        oldIdx = match.oldIdx + 1;
        newIdx = match.newIdx + 1;
    }
    
    // Handle any remaining differences after the last common line
    if (oldIdx < oldLines.length || newIdx < newLines.length) {
        hunks.push({
            startLine: oldIdx + 1,
            endLine: oldLines.length,
            oldLines: oldLines.slice(oldIdx),
            newLines: newLines.slice(newIdx),
        });
    }
    
    return hunks;
}

/**
 * Determine the type of diff based on hunks
 */
export function determineDiffType(hunks: DiffHunk[]): DiffType {
    const hasOld = hunks.some(h => h.oldLines.length > 0);
    const hasNew = hunks.some(h => h.newLines.length > 0);
    
    if (!hasOld && hasNew) return 'insert';
    if (hasOld && !hasNew) return 'delete';
    return 'replace';
}

/**
 * Generate a complete DocumentDiff from old and new content
 */
export function generateDiff(
    fileId: string,
    fileName: string,
    oldContent: string,
    newContent: string,
    description?: string
): DocumentDiff {
    const hunks = generateHunks(oldContent, newContent);
    const type = determineDiffType(hunks);
    
    return createDiff(
        fileId,
        fileName,
        type,
        oldContent,
        newContent,
        hunks,
        description
    );
}

/**
 * Merge multiple diffs for the same file into a single diff.
 * Applies diffs in createdAt order: each diff's hunks are applied to the running content.
 * Result: one diff with originalContent = first.originalContent, proposedContent = final content.
 */
export function mergeDiffsForFile(diffs: DocumentDiff[]): DocumentDiff | null {
    if (diffs.length === 0) return null;
    if (diffs.length === 1) return diffs[0];

    const sorted = [...diffs].sort((a, b) => a.createdAt - b.createdAt);
    const first = sorted[0];
    let content = first.originalContent;

    for (const d of sorted) {
        content = applyHunks(content, d.hunks);
    }

    return generateDiff(
        first.fileId,
        first.fileName,
        first.originalContent,
        content,
        'Merged changes'
    );
}

// ==================== Diff Application ====================

/**
 * Apply a diff to content, returning the new content
 */
export function applyDiff(originalContent: string, diff: DocumentDiff): string {
    // Simply return the proposed content since we store the full result
    return diff.proposedContent;
}

/**
 * Apply a single hunk to lines array (mutates in place)
 * Returns the offset adjustment for subsequent hunks
 */
export function applyHunk(lines: string[], hunk: DiffHunk, offset: number): number {
    const startIdx = hunk.startLine - 1 + offset; // Convert to 0-indexed with offset
    const deleteCount = hunk.oldLines.length;
    
    lines.splice(startIdx, deleteCount, ...hunk.newLines);
    
    // Return the offset change (new lines added minus old lines removed)
    return hunk.newLines.length - deleteCount;
}

/**
 * Apply multiple hunks to content
 */
export function applyHunks(content: string, hunks: DiffHunk[]): string {
    const lines = splitLines(content);
    let offset = 0;
    
    // Sort hunks by start line to apply in order
    const sortedHunks = [...hunks].sort((a, b) => a.startLine - b.startLine);
    
    for (const hunk of sortedHunks) {
        offset += applyHunk(lines, hunk, offset);
    }
    
    return joinLines(lines);
}

// ==================== Diff Display Formatting ====================

export interface FormattedLine {
    type: 'context' | 'addition' | 'deletion' | 'unchanged';
    content: string;
    oldLineNumber?: number;
    newLineNumber?: number;
}

/**
 * Format diff hunks for display in a unified diff view.
 * @param fullDocument - If true, include all unchanged lines (full document with diffs); if false, show only context around changes.
 */
export function formatDiffForDisplay(
    oldContent: string,
    newContent: string,
    contextLines: number = 3,
    fullDocument: boolean = false
): FormattedLine[] {
    const oldLines = splitLines(oldContent);
    const newLines = splitLines(newContent);
    const hunks = generateHunks(oldContent, newContent);
    
    if (hunks.length === 0) {
        // No changes - show all as unchanged
        return oldLines.map((line, idx) => ({
            type: 'unchanged' as const,
            content: line,
            oldLineNumber: idx + 1,
            newLineNumber: idx + 1,
        }));
    }
    
    const result: FormattedLine[] = [];
    let oldLineNum = 1;
    let newLineNum = 1;
    
    for (let hunkIdx = 0; hunkIdx < hunks.length; hunkIdx++) {
        const hunk = hunks[hunkIdx];
        const hunkStartOld = hunk.startLine;
        const nextHunkStart = hunkIdx < hunks.length - 1
            ? hunks[hunkIdx + 1].startLine
            : oldLines.length + 1;
        
        // Context before this hunk: full gap when fullDocument, else limited
        const contextStart = fullDocument
            ? oldLineNum
            : Math.max(oldLineNum, hunkStartOld - contextLines);
        
        // Add separator only when not full document (collapsed gap)
        if (!fullDocument && hunkIdx > 0 && oldLineNum < contextStart) {
            result.push({
                type: 'context',
                content: '...',
            });
        }
        
        // Add unchanged lines before the hunk
        for (let i = contextStart; i < hunkStartOld; i++) {
            result.push({
                type: 'unchanged',
                content: oldLines[i - 1],
                oldLineNumber: i,
                newLineNumber: newLineNum + (i - oldLineNum),
            });
        }
        
        newLineNum += (hunkStartOld - oldLineNum);
        oldLineNum = hunkStartOld;
        
        // Deleted lines
        for (const line of hunk.oldLines) {
            result.push({
                type: 'deletion',
                content: line,
                oldLineNumber: oldLineNum,
            });
            oldLineNum++;
        }
        
        // Added lines
        for (const line of hunk.newLines) {
            result.push({
                type: 'addition',
                content: line,
                newLineNumber: newLineNum,
            });
            newLineNum++;
        }
        
        // Context after this hunk: full gap when fullDocument, else limited
        const contextEnd = fullDocument
            ? nextHunkStart - 1
            : Math.min(oldLineNum + contextLines, nextHunkStart);
        
        for (let i = oldLineNum; i <= contextEnd; i++) {
            if (i <= oldLines.length) {
                result.push({
                    type: 'unchanged',
                    content: oldLines[i - 1],
                    oldLineNumber: i,
                    newLineNumber: newLineNum,
                });
                oldLineNum++;
                newLineNum++;
            }
        }
    }
    
    return result;
}

/**
 * Generate a simple text-based unified diff
 */
export function formatUnifiedDiff(
    oldContent: string,
    newContent: string,
    fileName: string
): string {
    const lines = formatDiffForDisplay(oldContent, newContent);
    const output: string[] = [];
    
    output.push(`--- a/${fileName}`);
    output.push(`+++ b/${fileName}`);
    
    for (const line of lines) {
        switch (line.type) {
            case 'addition':
                output.push(`+ ${line.content}`);
                break;
            case 'deletion':
                output.push(`- ${line.content}`);
                break;
            case 'context':
                output.push(`  ${line.content}`);
                break;
            case 'unchanged':
                output.push(`  ${line.content}`);
                break;
        }
    }
    
    return output.join('\n');
}

// ==================== Diff Statistics ====================

export interface DiffStats {
    additions: number;
    deletions: number;
    changes: number;
}

/**
 * Calculate statistics for a diff
 */
export function calculateDiffStats(diff: DocumentDiff): DiffStats {
    let additions = 0;
    let deletions = 0;
    
    for (const hunk of diff.hunks) {
        additions += hunk.newLines.length;
        deletions += hunk.oldLines.length;
    }
    
    return {
        additions,
        deletions,
        changes: additions + deletions,
    };
}
