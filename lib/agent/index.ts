/**
 * Agent Library
 * Re-exports all agent-related types and functions
 */

// Types
export type {
    MessageRole,
    FileMention,
    AgentMessage,
    AgentChat,
    DiffType,
    DiffStatus,
    DiffHunk,
    DocumentDiff,
    SearchMatch,
    SearchResult,
    Heading,
    DocumentMetadata,
    InsertPosition,
    AgentState,
} from './types';

export {
    generateId,
    createMessage,
    createDiff,
} from './types';

// Diff Utilities
export {
    splitLines,
    joinLines,
    generateHunks,
    determineDiffType,
    generateDiff,
    applyDiff,
    applyHunk,
    applyHunks,
    formatDiffForDisplay,
    formatUnifiedDiff,
    calculateDiffStats,
} from './diff-utils';

export type { FormattedLine, DiffStats } from './diff-utils';

// Document Operations
export {
    readDocument,
    readDocumentSection,
    getDocumentMetadata,
    findHeadings,
    searchInDocument,
    searchAllDocuments,
    proposeEdit,
    proposeInsert,
    proposeDelete,
    proposeReplaceSection,
    proposeFullReplace,
    documentOps,
} from './document-ops';

// AI Service
export {
    sendMessageToAI,
    streamMessageToAI,
} from './ai-service';
