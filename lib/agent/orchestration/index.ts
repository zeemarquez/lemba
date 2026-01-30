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
export { LinterAgent } from './agents/linter';
export { SummarizerAgent } from './agents/summarizer';

// Export tools
export { ToolRegistry, defaultToolRegistry, executeTool, TOOL_DEFINITIONS } from './tools';
export { webSearch, formatSearchResults } from './tools/web-search';
export type { WebSearchResult, WebSearchResponse } from './tools/web-search';
export { ragQuery, ragIndex, getRAGContext, formatRAGResults, formatRAGContext, getRAGStats } from './tools/rag-tools';

// Export prompts
export { getAgentPrompt, ORCHESTRATOR_PROMPT, PLANNER_PROMPT, RESEARCHER_PROMPT, WRITER_PROMPT, LINTER_PROMPT, SUMMARIZER_PROMPT } from './prompts';
