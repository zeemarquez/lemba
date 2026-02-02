/**
 * Agent Library
 * Re-exports all agent-related types and functions
 */

// Types
export type {
    MessageRole,
    FileMention,
    ImageAttachment,
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
    mergeDiffsForFile,
    withUpdatedProposedContent,
    applyDiff,
    applyHunk,
    applyHunks,
    formatDiffForDisplay,
    formatUnifiedDiff,
    calculateDiffStats,
} from './diff-utils';

// Math format normalizer (post-agent, code + regex only)
export { normalizeMathInMarkdown } from './math-format';

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

// Debug logging (filter console by "AI Agent")
export { agentLog } from './debug';

// AI Service
export {
    sendMessageToAI,
    streamMessageToAI,
    chatCompletionOneRound,
    chatCompletion,
    getApiKey,
    hasEnvApiKey,
    validateApiKey,
    modelToProvider,
    isTrialMode,
    isTrialOnlyOpenAI,
    TRIAL_MODEL_EXPORT as TRIAL_MODEL,
} from './ai-service';
export type {
    LLMProvider,
    SendMessageToAIOptions,
    ChatCompletionMessage,
    ChatCompletionTool,
    ChatCompletionOneRoundOptions,
    ChatCompletionOneRoundResult,
} from './ai-service';

// Orchestration System
export {
    runOrchestration,
    OrchestratorAgent,
    PlannerAgent,
    ResearcherAgent,
    WriterAgent,
    LinterAgent,
    RAGEngine,
    DocumentChunker,
    EmbeddingService,
    VectorStore,
    ToolRegistry,
} from './orchestration';

export type {
    OrchestrationOptions,
    OrchestrationResult,
} from './orchestration/orchestrator';

export type {
    AgentType,
    AgentContext,
    AgentTask,
    AgentResult,
    Workflow,
    WorkflowStep,
    IntentAnalysis,
    UserIntent,
    RAGChunk,
    RAGQueryResult,
    OrchestrationEvent,
} from './orchestration/types';
