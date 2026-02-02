/**
 * Multi-Agent Orchestration Types
 * Type definitions for the agent orchestration system
 */

import { AgentMessage, DocumentDiff, ImageAttachment } from '../types';

// ==================== Agent Types ====================

export type AgentType = 'orchestrator' | 'planner' | 'researcher' | 'writer' | 'structure_review' | 'linter' | 'summarizer';

export type TaskType = 'plan' | 'research' | 'write' | 'structure_review' | 'lint' | 'orchestrate';

export type TaskStatus = 'pending' | 'in_progress' | 'completed' | 'success' | 'error' | 'partial';

// ==================== RAG Types ====================

export interface RAGChunk {
    id: string;
    fileId: string;
    content: string;
    startLine: number;
    endLine: number;
    heading?: string;
    headingLevel?: number;
    tokenCount: number;
    embedding?: number[];
}

export interface RAGQueryResult {
    chunk: RAGChunk;
    score: number;
    highlights?: string[];
}

export interface RAGIndexEntry {
    fileId: string;
    chunks: RAGChunk[];
    lastIndexed: number;
    contentHash: string;
}

// ==================== Agent Context ====================

export interface DocumentContext {
    id: string;
    name: string;
    content: string;
    metadata?: {
        lineCount: number;
        wordCount: number;
        charCount: number;
        headings: Array<{
            level: number;
            text: string;
            line: number;
        }>;
    };
}

export interface AgentContext {
    /** Conversation history for context continuity */
    conversationHistory: AgentMessage[];

    /** Currently active document being worked on */
    activeDocument?: DocumentContext;

    /** RAG-retrieved relevant chunks for long documents */
    ragContext?: RAGChunk[];

    /** Outline/plan from the Planner agent */
    planOutline?: string;

    /** Research findings from the Researcher agent */
    researchFindings?: string;

    /** Mentioned files from user input */
    mentionedFiles?: string[];

    /** Image attachments from the user message (for vision in agent mode) */
    imageAttachments?: ImageAttachment[];

    /** Previous agent results in the current workflow */
    previousResults?: AgentResult[];

    /** Optional in-memory content overrides for tool execution */
    contentOverrides?: Record<string, string>;
}

// ==================== Agent Tasks ====================

export interface AgentTask {
    id: string;
    type: TaskType;
    agentType: AgentType;
    context: AgentContext;
    instructions: string;
    targetFileId?: string;
    priority?: number;
    parentTaskId?: string;
    createdAt: number;
}

export interface AgentResult {
    taskId: string;
    agentType: AgentType;
    status: TaskStatus;
    output: string;
    diffs?: DocumentDiff[];
    metadata?: Record<string, unknown>;
    error?: string;
    startedAt: number;
    completedAt: number;
    tokenUsage?: {
        prompt: number;
        completion: number;
        total: number;
    };
}

// ==================== Orchestration Workflow ====================

export interface WorkflowStep {
    id: string;
    agentType: AgentType;
    taskType: TaskType;
    instructions: string;
    dependsOn?: string[];
    status: TaskStatus;
    result?: AgentResult;
}

export interface Workflow {
    id: string;
    userRequest: string;
    steps: WorkflowStep[];
    currentStepIndex: number;
    status: TaskStatus;
    context: AgentContext;
    createdAt: number;
    updatedAt: number;
}

// ==================== Intent Classification ====================

export type UserIntent =
    | 'create_document'
    | 'edit_section'
    | 'expand_content'
    | 'summarize'
    | 'research'
    | 'reorganize'
    | 'fix_errors'
    | 'format'
    | 'review'
    | 'question'
    | 'unknown';

export interface IntentAnalysis {
    primaryIntent: UserIntent;
    confidence: number;
    requiredAgents: AgentType[];
    targetSections?: string[];
    suggestedWorkflow: WorkflowStep[];
}

// ==================== Agent Configuration ====================

export interface AgentConfig {
    type: AgentType;
    model: string;
    maxTokens: number;
    temperature: number;
    systemPrompt: string;
    tools: string[];
}

export const DEFAULT_AGENT_CONFIGS: Record<AgentType, Omit<AgentConfig, 'systemPrompt'>> = {
    orchestrator: {
        type: 'orchestrator',
        model: 'gpt-4o',
        maxTokens: 4096,
        temperature: 0.3,
        tools: ['dispatch_agent', 'analyze_intent', 'aggregate_results'],
    },
    planner: {
        type: 'planner',
        model: 'gpt-4o',
        maxTokens: 2048,
        temperature: 0.5,
        tools: ['get_document_metadata', 'find_headings', 'read_document_section'],
    },
    researcher: {
        type: 'researcher',
        model: 'gpt-4o-mini',
        maxTokens: 4096,
        temperature: 0.3,
        tools: ['rag_query', 'web_search', 'search_in_document', 'search_all_documents'],
    },
    writer: {
        type: 'writer',
        model: 'gpt-4o',
        maxTokens: 8192,
        temperature: 0.7,
        tools: ['propose_edit', 'propose_insert', 'propose_delete', 'propose_replace_section', 'read_document', 'read_document_section'],
    },
    structure_review: {
        type: 'structure_review',
        model: 'gpt-4o',
        maxTokens: 4096,
        temperature: 0.2,
        tools: ['get_document_structure', 'read_document', 'find_headings', 'update_section', 'add_section', 'remove_section', 'move_section', 'propose_edit', 'propose_replace_section'],
    },
    linter: {
        type: 'linter',
        model: 'gpt-4o-mini',
        maxTokens: 2048,
        temperature: 0.1,
        tools: ['lint_markdown', 'propose_edit', 'read_document'],
    },
    summarizer: {
        type: 'summarizer',
        model: 'gpt-4o-mini',
        maxTokens: 512,
        temperature: 0.3,
        tools: [],
    },
};

// ==================== Event Types ====================

export type OrchestrationEvent =
    | { type: 'workflow_started'; workflow: Workflow }
    | { type: 'step_started'; step: WorkflowStep }
    | { type: 'step_completed'; step: WorkflowStep; result: AgentResult }
    | { type: 'step_failed'; step: WorkflowStep; error: string }
    | { type: 'workflow_completed'; workflow: Workflow; finalResult: AgentResult }
    | { type: 'workflow_failed'; workflow: Workflow; error: string }
    | { type: 'diff_created'; diff: DocumentDiff };

export type OrchestrationEventHandler = (event: OrchestrationEvent) => void;

// ==================== Utility Types ====================

export interface PromptTemplate {
    name: string;
    content: string;
    variables: string[];
}

export function generateId(): string {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}
