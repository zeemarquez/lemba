/**
 * Agent Types
 * Type definitions for the AI agent system
 */

// ==================== Message Types ====================

export type MessageRole = 'user' | 'assistant' | 'system';

export interface FileMention {
    fileId: string;
    fileName: string;
    // Content snapshot at time of mention (for context)
    contentSnapshot?: string;
}

export interface AgentMessage {
    id: string;
    role: MessageRole;
    content: string;
    timestamp: number;
    // Files mentioned in this message
    mentions?: FileMention[];
    // Associated diffs (for assistant messages proposing changes)
    diffIds?: string[];
    // Full content sent to AI (if different from visible content)
    fullContent?: string;
    // Loading state for streaming responses
    isStreaming?: boolean;
}

// ==================== Diff Types ====================

export type DiffType = 'replace' | 'insert' | 'delete';
export type DiffStatus = 'pending' | 'approved' | 'rejected';

export interface DiffHunk {
    startLine: number;      // 1-indexed line number where change starts
    endLine: number;        // 1-indexed line number where change ends
    oldLines: string[];     // Original lines being replaced/deleted
    newLines: string[];     // New lines being inserted/replacing
}

export interface DocumentDiff {
    id: string;                    // Unique diff identifier
    fileId: string;                // Target file path
    fileName: string;              // Display name
    type: DiffType;                // Type of change
    originalContent: string;       // Full original markdown (for preview)
    proposedContent: string;       // Full proposed markdown (for preview)
    hunks: DiffHunk[];            // Individual change hunks
    status: DiffStatus;           // Current status
    createdAt: number;            // Timestamp
    description?: string;         // Human-readable description of the change
}

// ==================== Search Types ====================

export interface SearchMatch {
    lineNumber: number;     // 1-indexed line number
    lineContent: string;    // Full line content
    matchStart: number;     // Character index where match starts
    matchEnd: number;       // Character index where match ends
    context?: {
        before: string[];   // Lines before match
        after: string[];    // Lines after match
    };
}

export interface SearchResult {
    fileId: string;
    fileName: string;
    matches: SearchMatch[];
    totalMatches: number;
}

// ==================== Document Metadata Types ====================

export interface Heading {
    level: number;          // 1-6 for h1-h6
    text: string;           // Heading text content
    lineNumber: number;     // 1-indexed line number
    id?: string;            // Generated ID for navigation
}

export interface DocumentMetadata {
    fileId: string;
    fileName: string;
    lines: number;
    wordCount: number;
    charCount: number;
    headings: Heading[];
    lastModified?: number;
}

// ==================== Insert Position Types ====================

export type InsertPosition =
    | { type: 'line'; lineNumber: number }           // Insert at specific line
    | { type: 'afterHeading'; headingText: string }  // Insert after a heading
    | { type: 'start' }                              // Insert at document start
    | { type: 'end' };                               // Insert at document end

// ==================== Chat Types ====================

export interface AgentChat {
    id: string;
    title: string;                               // Derived from first user message or "New chat"
    messages: AgentMessage[];
    pendingDiffs: Record<string, DocumentDiff>;
    createdAt: number;
    updatedAt: number;
}

// ==================== Agent State Types ====================

export interface AgentState {
    messages: AgentMessage[];
    pendingDiffs: Record<string, DocumentDiff>;  // diffId -> diff
    mentionedFiles: string[];                    // Currently mentioned file IDs
    isLoading: boolean;
    error: string | null;
}

// ==================== Utility Functions ====================

export function generateId(): string {
    return crypto.randomUUID();
}

export function createMessage(
    role: MessageRole,
    content: string,
    mentions?: FileMention[],
    diffIds?: string[],
    fullContent?: string
): AgentMessage {
    return {
        id: generateId(),
        role,
        content,
        timestamp: Date.now(),
        mentions,
        diffIds,
        fullContent,
    };
}

export function createDiff(
    fileId: string,
    fileName: string,
    type: DiffType,
    originalContent: string,
    proposedContent: string,
    hunks: DiffHunk[],
    description?: string
): DocumentDiff {
    return {
        id: generateId(),
        fileId,
        fileName,
        type,
        originalContent,
        proposedContent,
        hunks,
        status: 'pending',
        createdAt: Date.now(),
        description,
    };
}
