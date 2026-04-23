/**
 * Diff Utilities
 * Functions for generating, applying, and displaying diffs.
 *
 * The diff model is line-granular at the top level (a `DiffHunk` describes
 * a replaced range of lines) with optional intra-line word-level annotations
 * so the UI can highlight just the changed words on an otherwise unchanged
 * line.
 */

import {
    DocumentDiff,
    DiffHunk,
    DiffType,
    HunkKind,
    WordChanges,
    WordChange,
    DiffConflict,
    createDiff,
} from './types';

// ==================== Line-level LCS ====================

export function splitLines(content: string): string[] {
    return content.split('\n');
}

export function joinLines(lines: string[]): string {
    return lines.join('\n');
}

/**
 * Longest common subsequence on line arrays. Returns the indices in each
 * array that form a shared sequence; anything not in the LCS is part of a
 * change.
 */
function lcs(oldLines: string[], newLines: string[]): { oldIdx: number; newIdx: number }[] {
    const m = oldLines.length;
    const n = newLines.length;
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

// ==================== Word-level diff ====================

/**
 * Tokenize a line into words + punctuation + whitespace runs. We keep
 * whitespace as its own tokens so prefix/suffix common parts can be
 * collapsed without touching spaces.
 */
function tokenize(line: string): string[] {
    // Matches: word, whitespace run, or single non-word non-space char.
    const re = /[A-Za-z0-9_]+|\s+|[^A-Za-z0-9_\s]/g;
    return line.match(re) ?? [];
}

/** Token-level LCS over two token arrays. */
function tokenLcs(a: string[], b: string[]): { aIdx: number; bIdx: number }[] {
    const m = a.length;
    const n = b.length;
    if (m === 0 || n === 0) return [];
    const dp: Uint16Array[] = [];
    for (let i = 0; i <= m; i++) dp.push(new Uint16Array(n + 1));

    for (let i = 1; i <= m; i++) {
        for (let j = 1; j <= n; j++) {
            if (a[i - 1] === b[j - 1]) {
                dp[i][j] = dp[i - 1][j - 1] + 1;
            } else {
                dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
            }
        }
    }

    const out: { aIdx: number; bIdx: number }[] = [];
    let i = m, j = n;
    while (i > 0 && j > 0) {
        if (a[i - 1] === b[j - 1]) {
            out.unshift({ aIdx: i - 1, bIdx: j - 1 });
            i--;
            j--;
        } else if (dp[i - 1][j] > dp[i][j - 1]) {
            i--;
        } else {
            j--;
        }
    }
    return out;
}

/**
 * Word-level diff between two single lines. Returns character ranges in
 * each line that differ. When the lines are effectively unrelated (the
 * common subsequence covers less than ~20% of either line), we return
 * full-line ranges so the UI does not draw a confetti of tiny highlights.
 */
export function computeLineWordDiff(
    oldLine: string,
    newLine: string
): { deletions: Array<{ start: number; end: number }>; additions: Array<{ start: number; end: number }> } {
    if (oldLine === newLine) {
        return { deletions: [], additions: [] };
    }
    const oldTokens = tokenize(oldLine);
    const newTokens = tokenize(newLine);

    const common = tokenLcs(oldTokens, newTokens);
    const totalOld = oldTokens.length;
    const totalNew = newTokens.length;
    const coverageOld = totalOld === 0 ? 1 : common.length / totalOld;
    const coverageNew = totalNew === 0 ? 1 : common.length / totalNew;

    // If the two lines share almost nothing, treat the whole line as changed.
    if (coverageOld < 0.2 && coverageNew < 0.2) {
        return {
            deletions: oldLine.length > 0 ? [{ start: 0, end: oldLine.length }] : [],
            additions: newLine.length > 0 ? [{ start: 0, end: newLine.length }] : [],
        };
    }

    // Convert token indexes to character ranges.
    const oldOffsets: number[] = [];
    let o = 0;
    for (const t of oldTokens) {
        oldOffsets.push(o);
        o += t.length;
    }
    oldOffsets.push(o);

    const newOffsets: number[] = [];
    let n2 = 0;
    for (const t of newTokens) {
        newOffsets.push(n2);
        n2 += t.length;
    }
    newOffsets.push(n2);

    const deletions: Array<{ start: number; end: number }> = [];
    const additions: Array<{ start: number; end: number }> = [];

    let oi = 0;
    let ni = 0;
    for (const m of common) {
        if (oi < m.aIdx) {
            deletions.push({ start: oldOffsets[oi], end: oldOffsets[m.aIdx] });
        }
        if (ni < m.bIdx) {
            additions.push({ start: newOffsets[ni], end: newOffsets[m.bIdx] });
        }
        oi = m.aIdx + 1;
        ni = m.bIdx + 1;
    }
    if (oi < oldTokens.length) {
        deletions.push({ start: oldOffsets[oi], end: oldOffsets[oldTokens.length] });
    }
    if (ni < newTokens.length) {
        additions.push({ start: newOffsets[ni], end: newOffsets[newTokens.length] });
    }

    return { deletions, additions };
}

/**
 * Compute word-level annotations for a hunk. Tries to pair old/new lines
 * by index when the counts match; falls back to pairing only when one
 * side of the hunk is small enough to make sensible pairs.
 */
export function computeHunkWordChanges(hunk: DiffHunk): WordChanges | undefined {
    const { oldLines, newLines } = hunk;
    if (oldLines.length === 0 || newLines.length === 0) return undefined;

    // When the counts match we pair 1-to-1.
    const pairs: Array<{ oldIdx: number; newIdx: number }> = [];
    if (oldLines.length === newLines.length) {
        for (let i = 0; i < oldLines.length; i++) {
            pairs.push({ oldIdx: i, newIdx: i });
        }
    } else if (oldLines.length === 1 && newLines.length === 1) {
        pairs.push({ oldIdx: 0, newIdx: 0 });
    } else {
        // Uneven counts: line-level LCS pairs identical lines; for non-identical
        // line pairs the UI just shows whole-line add/delete, which is fine.
        return undefined;
    }

    const allDeletions: WordChange[] = [];
    const allAdditions: WordChange[] = [];
    let anyChange = false;
    for (const { oldIdx, newIdx } of pairs) {
        const { deletions, additions } = computeLineWordDiff(oldLines[oldIdx], newLines[newIdx]);
        for (const d of deletions) {
            allDeletions.push({ line: oldIdx, start: d.start, end: d.end });
            anyChange = true;
        }
        for (const a of additions) {
            allAdditions.push({ line: newIdx, start: a.start, end: a.end });
            anyChange = true;
        }
    }

    if (!anyChange) return undefined;
    return { deletions: allDeletions, additions: allAdditions };
}

// ==================== Hunk classification ====================

/** Does a string look like it contains a markdown heading? */
function containsHeading(lines: string[]): boolean {
    return lines.some(l => /^\s{0,3}#{1,6}\s/.test(l));
}

/** Is the difference only whitespace/line breaks? */
function isFormatOnly(hunk: DiffHunk): boolean {
    const oldNormalized = hunk.oldLines.join('\n').replace(/\s+/g, ' ').trim();
    const newNormalized = hunk.newLines.join('\n').replace(/\s+/g, ' ').trim();
    return oldNormalized === newNormalized && oldNormalized !== '';
}

/**
 * Heuristic classification of a hunk so the UI can show an icon hint.
 * Order matters: format check goes first because a pure-whitespace edit
 * otherwise looks like a prose edit.
 */
export function classifyHunk(hunk: DiffHunk): HunkKind {
    if (hunk.oldLines.length === 0 && hunk.newLines.length > 0) {
        return 'insert_block';
    }
    if (hunk.newLines.length === 0 && hunk.oldLines.length > 0) {
        return 'delete_block';
    }
    if (isFormatOnly(hunk)) {
        return 'format';
    }
    if (containsHeading(hunk.oldLines) || containsHeading(hunk.newLines)) {
        return 'section_edit';
    }
    if (hunk.oldLines.length === 1 && hunk.newLines.length === 1) {
        const oldLen = hunk.oldLines[0].length;
        const newLen = hunk.newLines[0].length;
        const maxLen = Math.max(oldLen, newLen, 1);
        const delta = Math.abs(oldLen - newLen);
        // Short line, tiny delta: treat as a typo fix.
        if (maxLen < 120 && delta <= 8) {
            return 'typo';
        }
    }
    return 'prose_edit';
}

// ==================== Hunk generation ====================

export function generateHunks(oldContent: string, newContent: string): DiffHunk[] {
    const oldLines = splitLines(oldContent);
    const newLines = splitLines(newContent);
    const commonLines = lcs(oldLines, newLines);
    const hunks: DiffHunk[] = [];

    let oldIdx = 0;
    let newIdx = 0;

    const pushHunk = (hunkOldStart: number, hunkOldEnd: number, hunkNewStart: number, hunkNewEnd: number) => {
        const hunk: DiffHunk = {
            startLine: hunkOldStart + 1,
            endLine: hunkOldEnd, // may equal startLine-1 for pure inserts
            oldLines: oldLines.slice(hunkOldStart, hunkOldEnd),
            newLines: newLines.slice(hunkNewStart, hunkNewEnd),
        };
        hunk.wordChanges = computeHunkWordChanges(hunk);
        hunk.kind = classifyHunk(hunk);
        hunks.push(hunk);
    };

    for (const match of commonLines) {
        if (oldIdx < match.oldIdx || newIdx < match.newIdx) {
            pushHunk(oldIdx, match.oldIdx, newIdx, match.newIdx);
        }
        oldIdx = match.oldIdx + 1;
        newIdx = match.newIdx + 1;
    }
    if (oldIdx < oldLines.length || newIdx < newLines.length) {
        pushHunk(oldIdx, oldLines.length, newIdx, newLines.length);
    }

    return hunks;
}

export function determineDiffType(hunks: DiffHunk[]): DiffType {
    const hasOld = hunks.some(h => h.oldLines.length > 0);
    const hasNew = hunks.some(h => h.newLines.length > 0);
    if (!hasOld && hasNew) return 'insert';
    if (hasOld && !hasNew) return 'delete';
    return 'replace';
}

export function withUpdatedProposedContent(diff: DocumentDiff, newProposedContent: string): DocumentDiff {
    if (diff.proposedContent === newProposedContent) return diff;
    const hunks = generateHunks(diff.originalContent, newProposedContent);
    const type = determineDiffType(hunks);
    return { ...diff, proposedContent: newProposedContent, hunks, type };
}

export function generateDiff(
    fileId: string,
    fileName: string,
    oldContent: string,
    newContent: string,
    description?: string
): DocumentDiff {
    const hunks = generateHunks(oldContent, newContent);
    const type = determineDiffType(hunks);
    return createDiff(fileId, fileName, type, oldContent, newContent, hunks, description);
}

function normalizeContent(s: string): string {
    return (s ?? '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
}

// ==================== Merging ====================

/**
 * Merge multiple diffs for the same file into a single diff.
 *
 * Two modes:
 *  - Sequential: each diff is already expressed against the previous
 *    diff's proposedContent. We simply chain proposedContent values.
 *  - Parallel: all diffs share the same originalContent. Non-overlapping
 *    hunks are applied in order. Overlapping hunks are resolved with
 *    **last-write-wins by createdAt** and the dropped edits are recorded
 *    as conflicts on the resulting diff.
 */
export function mergeDiffsForFile(diffs: DocumentDiff[]): DocumentDiff | null {
    if (diffs.length === 0) return null;
    if (diffs.length === 1) return diffs[0];

    const sorted = [...diffs].sort((a, b) => a.createdAt - b.createdAt);
    const first = sorted[0];

    const baseNorm = normalizeContent(first.originalContent);
    const allSameBase = sorted.every(d => normalizeContent(d.originalContent) === baseNorm);

    if (!allSameBase) {
        // Sequential: the last proposedContent reflects all edits.
        const lastDiff = sorted[sorted.length - 1];
        return generateDiff(
            first.fileId,
            first.fileName,
            first.originalContent,
            lastDiff.proposedContent,
            sorted.length > 1 ? 'Merged changes' : lastDiff.description
        );
    }

    // Parallel: annotate each hunk with its source diff's createdAt so we
    // can resolve overlaps by "last writer wins".
    type TaggedHunk = DiffHunk & { __ts: number };
    const allHunks: TaggedHunk[] = sorted.flatMap(d => d.hunks.map(h => ({ ...h, __ts: d.createdAt })));

    // Sort by start line; ties go to the later createdAt last so that when
    // we process in the final application order it is deterministic.
    allHunks.sort((a, b) => a.startLine - b.startLine || a.__ts - b.__ts);

    const conflicts: DiffConflict[] = [];
    const keptHunks: TaggedHunk[] = [];

    for (const hunk of allHunks) {
        const hunkRangeEnd = hunk.startLine + Math.max(hunk.oldLines.length, 1) - 1;
        let overlapIdx = -1;
        for (let i = 0; i < keptHunks.length; i++) {
            const k = keptHunks[i];
            const kEnd = k.startLine + Math.max(k.oldLines.length, 1) - 1;
            const disjoint = hunkRangeEnd < k.startLine || hunk.startLine > kEnd;
            if (!disjoint) {
                overlapIdx = i;
                break;
            }
        }

        if (overlapIdx === -1) {
            keptHunks.push(hunk);
            continue;
        }

        const existing = keptHunks[overlapIdx];
        if (hunk.__ts >= existing.__ts) {
            // New hunk is at least as recent: it wins.
            conflicts.push({
                startLine: Math.min(existing.startLine, hunk.startLine),
                endLine: Math.max(
                    existing.startLine + existing.oldLines.length - 1,
                    hunk.startLine + hunk.oldLines.length - 1
                ),
                kept: hunk.newLines,
                dropped: existing.newLines,
            });
            keptHunks.splice(overlapIdx, 1, hunk);
        } else {
            // Existing is more recent; drop the new one.
            conflicts.push({
                startLine: Math.min(existing.startLine, hunk.startLine),
                endLine: Math.max(
                    existing.startLine + existing.oldLines.length - 1,
                    hunk.startLine + hunk.oldLines.length - 1
                ),
                kept: existing.newLines,
                dropped: hunk.newLines,
            });
        }
    }

    keptHunks.sort((a, b) => a.startLine - b.startLine);
    const strippedHunks: DiffHunk[] = keptHunks.map(({ __ts, ...rest }) => rest);
    const content = applyHunks(first.originalContent, strippedHunks);

    const merged = generateDiff(
        first.fileId,
        first.fileName,
        first.originalContent,
        content,
        conflicts.length > 0
            ? `Merged changes (${conflicts.length} conflict${conflicts.length === 1 ? '' : 's'} resolved)`
            : 'Merged changes'
    );
    if (conflicts.length > 0) merged.conflicts = conflicts;
    return merged;
}

// ==================== Application ====================

export function applyDiff(_originalContent: string, diff: DocumentDiff): string {
    return diff.proposedContent;
}

export function applyHunk(lines: string[], hunk: DiffHunk, offset: number): number {
    const startIdx = hunk.startLine - 1 + offset;
    const deleteCount = hunk.oldLines.length;
    lines.splice(startIdx, deleteCount, ...hunk.newLines);
    return hunk.newLines.length - deleteCount;
}

export function applyHunks(content: string, hunks: DiffHunk[]): string {
    const lines = splitLines(content);
    let offset = 0;
    const sortedHunks = [...hunks].sort((a, b) => a.startLine - b.startLine);
    for (const hunk of sortedHunks) {
        offset += applyHunk(lines, hunk, offset);
    }
    return joinLines(lines);
}

/**
 * Apply only the selected hunks to the diff's original content, returning
 * the new proposed content. Indexes refer to positions in `diff.hunks`.
 * Used by per-hunk accept/reject to recompute state without regenerating
 * the full diff from scratch.
 */
export function applyPartial(diff: DocumentDiff, acceptedHunkIndexes: number[]): string {
    const indexes = new Set(acceptedHunkIndexes);
    const selected = diff.hunks.filter((_, i) => indexes.has(i));
    return applyHunks(diff.originalContent, selected);
}

// ==================== Display ====================

export interface FormattedLine {
    type: 'context' | 'addition' | 'deletion' | 'unchanged';
    content: string;
    oldLineNumber?: number;
    newLineNumber?: number;
    /**
     * Intra-line character ranges that differ. Attached only when the hunk
     * provided `wordChanges` and this line is part of a paired change.
     */
    wordRanges?: Array<{ start: number; end: number }>;
    /** Optional semantic label inherited from the hunk. */
    hunkKind?: HunkKind;
    /** Zero-based hunk index for per-hunk UI controls. */
    hunkIndex?: number;
}

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

        const contextStart = fullDocument
            ? oldLineNum
            : Math.max(oldLineNum, hunkStartOld - contextLines);

        if (!fullDocument && hunkIdx > 0 && oldLineNum < contextStart) {
            result.push({ type: 'context', content: '...' });
        }

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
        for (let i = 0; i < hunk.oldLines.length; i++) {
            const line = hunk.oldLines[i];
            const wordRanges = hunk.wordChanges
                ? hunk.wordChanges.deletions
                    .filter(d => d.line === i)
                    .map(d => ({ start: d.start, end: d.end }))
                : undefined;
            result.push({
                type: 'deletion',
                content: line,
                oldLineNumber: oldLineNum,
                wordRanges: wordRanges && wordRanges.length > 0 ? wordRanges : undefined,
                hunkKind: hunk.kind,
                hunkIndex: hunkIdx,
            });
            oldLineNum++;
        }

        // Added lines
        for (let i = 0; i < hunk.newLines.length; i++) {
            const line = hunk.newLines[i];
            const wordRanges = hunk.wordChanges
                ? hunk.wordChanges.additions
                    .filter(a => a.line === i)
                    .map(a => ({ start: a.start, end: a.end }))
                : undefined;
            result.push({
                type: 'addition',
                content: line,
                newLineNumber: newLineNum,
                wordRanges: wordRanges && wordRanges.length > 0 ? wordRanges : undefined,
                hunkKind: hunk.kind,
                hunkIndex: hunkIdx,
            });
            newLineNum++;
        }

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
            case 'addition':  output.push(`+ ${line.content}`); break;
            case 'deletion':  output.push(`- ${line.content}`); break;
            case 'context':   output.push(`  ${line.content}`); break;
            case 'unchanged': output.push(`  ${line.content}`); break;
        }
    }
    return output.join('\n');
}

// ==================== Stats ====================

export interface DiffStats {
    additions: number;
    deletions: number;
    changes: number;
}

export function calculateDiffStats(diff: DocumentDiff): DiffStats {
    let additions = 0;
    let deletions = 0;
    for (const hunk of diff.hunks) {
        additions += hunk.newLines.length;
        deletions += hunk.oldLines.length;
    }
    return { additions, deletions, changes: additions + deletions };
}
