/**
 * Multi-Agent Orchestration System
 * Main entry point for the orchestration layer
 */

// Export types
export * from './types';

// Export RAG components
export { RAGEngine, defaultRAGEngine } from './rag';
export { DocumentChunker, defaultChunker } from './rag/chunker';
export { EmbeddingService, defaultEmbeddingService } from './rag/embeddings';
export { VectorStore, defaultVectorStore } from './rag/vector-store';

// Export agents
export { OrchestratorAgent, runOrchestration } from './orchestrator';
export type { OrchestrationOptions, OrchestrationResult } from './orchestrator';
export { PlannerAgent } from './agents/planner';
export { ResearcherAgent } from './agents/researcher';
export { WriterAgent } from './agents/writer';
export { StructureReviewAgent } from './agents/structure-review';
export { LinterAgent } from './agents/linter';
export { SummarizerAgent } from './agents/summarizer';

// Export tools
export { ToolRegistry, defaultToolRegistry, executeTool, TOOL_DEFINITIONS } from './tools';
export { webSearch, formatSearchResults } from './tools/web-search';
export type { WebSearchResult, WebSearchResponse } from './tools/web-search';
export { ragQuery, ragIndex, getRAGContext, formatRAGResults, formatRAGContext, getRAGStats } from './tools/rag-tools';

// Export prompts
export { getAgentPrompt, ORCHESTRATOR_PROMPT, PLANNER_PROMPT, RESEARCHER_PROMPT, WRITER_PROMPT, WRITER_QUICK_PROMPT, WRITER_EDIT_PROMPT, WRITER_CREATE_PROMPT, STRUCTURE_REVIEW_PROMPT, LINTER_PROMPT, SUMMARIZER_PROMPT, HOUSE_RULES, FILE_ID_RULES, SAFE_EDIT_RULES } from './prompts';

// Export router
export { route, decisionLabel } from './router';
export type { RouterIntent, RouterDecision, EditScope, RouteOptions, TargetLength } from './router';
