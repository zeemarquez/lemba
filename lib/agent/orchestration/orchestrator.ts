/**
 * Orchestrator Agent
 * Central coordinator for the multi-agent system
 */

import { AgentMessage, DocumentDiff } from '../types';
import { agentLog } from '../debug';
import type { LLMProvider } from '../ai-service';
import { getApiKey } from '../ai-service';
import {
    AgentType,
    AgentContext,
    AgentResult,
    Workflow,
    WorkflowStep,
    TaskType,
    TaskStatus,
    OrchestrationEvent,
    OrchestrationEventHandler,
    generateId,
} from './types';
import { ToolRegistry, defaultToolRegistry } from './tools';
import { RAGEngine, defaultRAGEngine } from './rag';
import { EmbeddingService } from './rag/embeddings';
import { VectorStore, defaultVectorStore } from './rag/vector-store';
import { defaultChunker } from './rag/chunker';
import { PlannerAgent } from './agents/planner';
import { ResearcherAgent } from './agents/researcher';
import { WriterAgent } from './agents/writer';
import type { WriterVariant } from './agents/writer';
import { StructureReviewAgent } from './agents/structure-review';
import { LinterAgent } from './agents/linter';
import { SummarizerAgent } from './agents/summarizer';
import { mergeDiffsForFile, withUpdatedProposedContent } from '../diff-utils';
import { enforceHouseRules } from '../math-format';
import { route, RouterDecision, decisionLabel, TargetLength } from './router';

// ==================== Types ====================

export interface OrchestrationOptions {
    provider?: LLMProvider;
    model?: string;
    temperature?: number;
    maxTokens?: number;
    apiKey?: string;
    readOnly?: boolean;
    onEvent?: OrchestrationEventHandler;
    onDiffCreated?: (diff: DocumentDiff) => void;
    /** In-memory content for mentioned files; overrides IndexedDB to use latest unsaved edits */
    initialContentOverrides?: Record<string, string>;
}

export interface OrchestrationResult {
    success: boolean;
    content: string;
    diffs: DocumentDiff[];
    workflow?: Workflow;
    error?: string;
    /**
     * Router decision used to build the workflow. Exposed so the UI can
     * show a pill like "Fast edit" / "Full workflow" and explain why.
     */
    routerDecision?: RouterDecision;
}

// ==================== Orchestrator Agent ====================

export class OrchestratorAgent {
    private toolRegistry: ToolRegistry;
    private ragEngine: RAGEngine;
    private plannerAgent: PlannerAgent;
    private researcherAgent: ResearcherAgent;
    private writerAgent: WriterAgent;
    private structureReviewAgent: StructureReviewAgent;
    private linterAgent: LinterAgent;
    private summarizerAgent: SummarizerAgent;
    private provider: LLMProvider;
    private apiKey: string;
    private eventHandler?: OrchestrationEventHandler;

    constructor(
        options: {
            toolRegistry?: ToolRegistry;
            ragEngine?: RAGEngine;
            provider?: LLMProvider;
            apiKey?: string;
            /** Explicit OpenAI key for embeddings. When omitted, falls back to
             *  the LLM apiKey (if provider === 'openai') then env vars. */
            embeddingApiKey?: string;
        } = {}
    ) {
        this.toolRegistry = options.toolRegistry || defaultToolRegistry;
        this.provider = options.provider ?? 'openai';
        this.apiKey = getApiKey(this.provider, options.apiKey);

        // Build the RAG engine with the correct embedding key so that the
        // user's settings-stored API key is actually used for embeddings.
        // Priority: explicit embeddingApiKey > current apiKey (when OpenAI) > env vars.
        if (options.ragEngine) {
            this.ragEngine = options.ragEngine;
        } else {
            const embeddingKey =
                options.embeddingApiKey?.trim() ||
                (this.provider === 'openai' ? this.apiKey : undefined);
            const embeddingService = new EmbeddingService(
                embeddingKey ? { apiKey: embeddingKey } : {}
            );
            this.ragEngine = new RAGEngine({
                chunker: defaultChunker,
                embeddingService,
                vectorStore: defaultVectorStore,
            });
        }

        // Initialize specialist agents
        this.plannerAgent = new PlannerAgent({
            toolRegistry: this.toolRegistry,
            provider: this.provider,
            apiKey: this.apiKey,
        });
        this.researcherAgent = new ResearcherAgent({
            toolRegistry: this.toolRegistry,
            ragEngine: this.ragEngine,
            provider: this.provider,
            apiKey: this.apiKey,
        });
        this.writerAgent = new WriterAgent({
            toolRegistry: this.toolRegistry,
            provider: this.provider,
            apiKey: this.apiKey,
        });
        this.structureReviewAgent = new StructureReviewAgent({
            toolRegistry: this.toolRegistry,
            provider: this.provider,
            apiKey: this.apiKey,
        });
        this.linterAgent = new LinterAgent({
            toolRegistry: this.toolRegistry,
            provider: this.provider,
            apiKey: this.apiKey,
        });
        this.summarizerAgent = new SummarizerAgent({ provider: this.provider, apiKey: this.apiKey });
    }

    /**
     * Main entry point for orchestration
     */
    async run(
        userMessage: string,
        context: AgentContext,
        options: OrchestrationOptions = {}
    ): Promise<OrchestrationResult> {
        this.eventHandler = options.onEvent;
        const collectedDiffs: DocumentDiff[] = [];
        const collectedDiffIds = new Set<string>();
        const contentOverrides: Record<string, string> = { ...(options.initialContentOverrides ?? {}) };

        const updateContentOverride = (fileId: string) => {
            const fileDiffs = collectedDiffs.filter(d => d.fileId === fileId);
            const merged = mergeDiffsForFile(fileDiffs);
            if (merged) {
                contentOverrides[fileId] = merged.proposedContent;
            }
        };

        const addCollectedDiff = (diff: DocumentDiff) => {
            if (collectedDiffIds.has(diff.id)) return;
            const isDuplicate = collectedDiffs.some(
                d => d.fileId === diff.fileId && d.proposedContent === diff.proposedContent
            );
            collectedDiffIds.add(diff.id);
            if (isDuplicate) return;
            collectedDiffs.push(diff);
            updateContentOverride(diff.fileId);
        };

        const onDiff = (diff: DocumentDiff) => {
            addCollectedDiff(diff);
            if (options.onDiffCreated) {
                options.onDiffCreated(diff);
            }
            this.emitEvent({ type: 'diff_created', diff });
        };

        let routerDecision: RouterDecision | undefined;
        try {
            // Step 1: Route the message to a pipeline.
            routerDecision = await route(userMessage, {
                provider: this.provider,
                apiKey: this.apiKey,
                document: context.activeDocument
                    ? {
                        lineCount: context.activeDocument.content.split('\n').length,
                        wordCount: context.activeDocument.content.split(/\s+/).filter(Boolean).length,
                        hasHeadings: /^#{1,6}\s/m.test(context.activeDocument.content),
                    }
                    : undefined,
            });
            agentLog.info('router decision', {
                intent: routerDecision.intent,
                scope: routerDecision.scope,
                agents: routerDecision.requiredAgents,
                source: routerDecision.source,
            });
            this.emitEvent({
                type: 'route_decided',
                intent: routerDecision.intent,
                label: decisionLabel(routerDecision),
                agents: routerDecision.requiredAgents,
                source: routerDecision.source,
            });

            // Step 2: Build a workflow from the router's agent list.
            const workflow = this.createWorkflow(userMessage, routerDecision, context);
            this.emitEvent({ type: 'workflow_started', workflow });

            // Step 3: Execute workflow steps
            let lastResult: AgentResult | null = null;
            const results: AgentResult[] = [];

            for (let i = 0; i < workflow.steps.length; i++) {
                const step = workflow.steps[i];
                workflow.currentStepIndex = i;
                step.status = 'in_progress';
                this.emitEvent({ type: 'step_started', step, index: i, total: workflow.steps.length });
                agentLog.step(`step ${i + 1}/${workflow.steps.length}: ${step.agentType}`, { taskType: step.taskType });

                // Skip if read-only and step would make edits
                if (options.readOnly && (step.agentType === 'writer' || step.agentType === 'structure_review' || step.agentType === 'linter')) {
                    step.status = 'completed';
                    const skipResult: AgentResult = {
                        taskId: step.id,
                        agentType: step.agentType,
                        status: 'success',
                        output: 'Skipped in read-only mode',
                        startedAt: Date.now(),
                        completedAt: Date.now(),
                    };
                    step.result = skipResult;
                    results.push(skipResult);
                    continue;
                }

                try {
                    const stepContext = this.buildStepContext(context, results, workflow, contentOverrides);

                    const result = await this.executeAgentWithRetry(
                        step.agentType,
                        step.instructions,
                        stepContext,
                        onDiff,
                        options,
                        3,
                        routerDecision?.writerVariant,
                        routerDecision?.targetLength,
                    );

                    step.status = result.status;
                    step.result = result;
                    results.push(result);
                    lastResult = result;
                    agentLog.step(`step ${step.agentType} done`, { status: result.status, outputLength: result.output?.length ?? 0, diffs: result.diffs?.length ?? 0 });

                    // Collect diffs from result
                    if (result.diffs) {
                        result.diffs.forEach(addCollectedDiff);
                    }

                    this.emitEvent({ type: 'step_completed', step, result });

                    // Update workflow context with results
                    if (step.agentType === 'planner' && result.output) {
                        workflow.context.planOutline = result.output;
                    }
                    if (step.agentType === 'researcher' && result.output) {
                        workflow.context.researchFindings = result.output;
                    }

                } catch (error) {
                    step.status = 'error';
                    const errorMsg = String(error);
                    agentLog.error(`step ${step.agentType} failed`, errorMsg);
                    this.emitEvent({ type: 'step_failed', step, error: errorMsg });

                    // Continue with other steps if possible
                    const errorResult: AgentResult = {
                        taskId: step.id,
                        agentType: step.agentType,
                        status: 'error',
                        output: '',
                        error: errorMsg,
                        startedAt: Date.now(),
                        completedAt: Date.now(),
                    };
                    step.result = errorResult;
                    results.push(errorResult);
                }
            }

            // Post-process: enforce the deterministic house rules (block
            // equations, numbered headings, blank-line-before-block, etc.)
            // on every proposed diff. The propose_* tools already normalize
            // on creation, but merging / partial tool results can leave the
            // final proposedContent slightly out of shape.
            for (let i = 0; i < collectedDiffs.length; i++) {
                const d = collectedDiffs[i];
                const normalized = enforceHouseRules(d.proposedContent);
                if (normalized !== d.proposedContent) {
                    collectedDiffs[i] = withUpdatedProposedContent(d, normalized);
                    updateContentOverride(d.fileId);
                }
            }

            // Step 5: Build the chat message.
            workflow.status = 'success';
            let finalContent: string;

            if (routerDecision.intent === 'research_question') {
                const researchResult = results.find(r => r.agentType === 'researcher');
                finalContent = researchResult?.output ?? "I couldn't find an answer. Please try rephrasing.";
            } else if (!routerDecision.useSummarizer) {
                // Fast path: use the single agent's final message directly.
                // This saves one LLM round on simple edits.
                const writerResult = results.find(r => r.agentType === 'writer');
                const structureResult = results.find(r => r.agentType === 'structure_review');
                const linterResult = results.find(r => r.agentType === 'linter');
                finalContent =
                    writerResult?.output?.trim() ||
                    structureResult?.output?.trim() ||
                    linterResult?.output?.trim() ||
                    this.getFallbackResponse(collectedDiffs, results);
                if (!finalContent) {
                    finalContent = this.getFallbackResponse(collectedDiffs, results);
                }
            } else {
                const summaryInput = this.buildSummaryForChat(results, routerDecision, userMessage, collectedDiffs);
                try {
                    finalContent = await this.summarizerAgent.run(summaryInput, {
                        model: options.model,
                        temperature: options.temperature,
                        maxTokens: options.maxTokens,
                    });
                } catch {
                    finalContent = this.getFallbackResponse(collectedDiffs, results);
                }
            }

            this.emitEvent({
                type: 'workflow_completed',
                workflow,
                finalResult: lastResult || {
                    taskId: workflow.id,
                    agentType: 'orchestrator',
                    status: 'success',
                    output: finalContent,
                    startedAt: workflow.createdAt,
                    completedAt: Date.now(),
                }
            });

            return {
                success: true,
                content: finalContent,
                diffs: collectedDiffs,
                workflow,
                routerDecision,
            };

        } catch (error) {
            const errorMsg = String(error);
            agentLog.error('orchestration failed', errorMsg);
            return {
                success: false,
                content: `I encountered an error while processing your request: ${errorMsg}`,
                diffs: collectedDiffs,
                error: errorMsg,
                routerDecision,
            };
        }
    }

    /**
     * Build a workflow from the router's decision. Each required agent
     * becomes a step; `dependsOn` wires them sequentially so the orchestrator
     * runs them in order and can short-circuit on failure.
     */
    private createWorkflow(
        userMessage: string,
        decision: RouterDecision,
        context: AgentContext,
    ): Workflow {
        const steps: WorkflowStep[] = decision.requiredAgents.map((agentType, index) => ({
            id: generateId(),
            agentType,
            taskType: this.getTaskTypeForAgent(agentType),
            instructions: this.generateInstructions(agentType, userMessage, decision),
            dependsOn: index > 0 ? [decision.requiredAgents[index - 1]] : undefined,
            status: 'pending' as TaskStatus,
        }));

        return {
            id: generateId(),
            userRequest: userMessage,
            steps,
            currentStepIndex: 0,
            status: 'pending',
            context: { ...context },
            createdAt: Date.now(),
            updatedAt: Date.now(),
        };
    }

    private getTaskTypeForAgent(agentType: AgentType): TaskType {
        switch (agentType) {
            case 'planner': return 'plan';
            case 'researcher': return 'research';
            case 'writer': return 'write';
            case 'structure_review': return 'structure_review';
            case 'linter': return 'lint';
            default: return 'orchestrate';
        }
    }

    /**
     * Instructions are shorter than before since the per-agent system
     * prompts now carry all the markdown house rules. We just tell each
     * agent what the user wants and a scope hint.
     */
    private generateInstructions(
        agentType: AgentType,
        userMessage: string,
        decision: RouterDecision,
    ): string {
        const scopeHint = `Scope: ${decision.scope}. Router intent: ${decision.intent}.`;
        const lengthHint = decision.targetLength
            ? `\nLength target: ${decision.targetLength.label} (~${decision.targetLength.targetWords} words, minimum ${decision.targetLength.minWords} words${decision.targetLength.minSections ? `, at least ${decision.targetLength.minSections} sections` : ''}).`
            : '';
        const base = `User request: "${userMessage}"\n${scopeHint}${lengthHint}`;

        switch (agentType) {
            case 'planner':
                if (decision.targetLength) {
                    return `${base}\n\nProduce a detailed outline with at least ${decision.targetLength.minSections ?? 5} sections. Each section should include a sentence describing what content it should contain. The outline must guide the writer to produce ${decision.targetLength.targetWords}+ words of substantive content.`;
                }
                return `${base}\n\nProduce a short outline for this request. ${decision.scope === 'large' ? '' : 'Keep the plan very short (3 items or fewer).'}`;
            case 'researcher':
                if (decision.intent === 'research_question') {
                    return `${base}\n\nAnswer this question using RAG and web search. Do not propose edits.`;
                }
                return `${base}\n\nGather just enough context for the writer to make the change. Keep findings short.`;
            case 'writer': {
                const variantNote = decision.writerVariant === 'quick'
                    ? 'Make the smallest possible edit that satisfies the request. One or two tool calls, then summarize.'
                    : decision.writerVariant === 'create'
                        ? `Follow the plan sequentially. Synthesize research into original prose.${decision.targetLength ? ` You MUST write at least ${decision.targetLength.targetWords} words. Use multiple propose_insert calls, one per section. Do NOT stop until the target word count is reached.` : ''}`
                        : `Batch related edits into one response. Do not over-expand the change.${decision.targetLength ? ` The user expects ${decision.targetLength.label} content — aim for ~${decision.targetLength.targetWords} words.` : ''}`;
                return `${base}\n\n${variantNote}`;
            }
            case 'structure_review':
                return `${base}\n\nFix structural issues in a single run: call get_document_structure, then issue all remove_section / update_section / move_section calls in one response. Use occurrenceIndex for duplicate headings. Also check for CONTENT-LEVEL duplicates (paragraphs or sections that say the same thing in different words) and remove the less detailed one.`;
            case 'linter':
                return `${base}\n\nRun lint_markdown and fix only the issues it reports. Do not rewrite prose.`;
            default:
                return base;
        }
    }

    /**
     * Build context for a workflow step
     */
    private buildStepContext(
        baseContext: AgentContext,
        previousResults: AgentResult[],
        workflow: Workflow,
        contentOverrides: Record<string, string>
    ): AgentContext {
        const nextContext: AgentContext = {
            ...baseContext,
            planOutline: workflow.context.planOutline,
            researchFindings: workflow.context.researchFindings,
            previousResults,
            contentOverrides,
        };
        if (nextContext.activeDocument) {
            const override = contentOverrides[nextContext.activeDocument.id];
            if (override !== undefined) {
                nextContext.activeDocument = {
                    ...nextContext.activeDocument,
                    content: override,
                };
            }
        }
        return nextContext;
    }

    private async executeAgent(
        agentType: AgentType,
        instructions: string,
        context: AgentContext,
        onDiff: (diff: DocumentDiff) => void,
        options: OrchestrationOptions,
        writerVariant?: WriterVariant,
        targetLength?: TargetLength,
    ): Promise<AgentResult> {
        const startedAt = Date.now();

        const agentOptions = {
            model: options.model,
            temperature: options.temperature,
            maxTokens: options.maxTokens,
            onDiffCreated: onDiff,
        };

        let output: string;
        let diffs: DocumentDiff[] = [];

        switch (agentType) {
            case 'planner':
                output = await this.plannerAgent.run(instructions, context, agentOptions);
                break;

            case 'researcher':
                output = await this.researcherAgent.run(instructions, context, agentOptions);
                break;

            case 'writer': {
                const writerResult = await this.writerAgent.run(instructions, context, {
                    ...agentOptions,
                    variant: writerVariant,
                    targetLength,
                });
                output = writerResult.output;
                diffs = writerResult.diffs;
                break;
            }

            case 'structure_review': {
                const structureReviewResult = await this.structureReviewAgent.run(instructions, context, agentOptions);
                output = structureReviewResult.output;
                diffs = structureReviewResult.diffs;
                break;
            }

            case 'linter': {
                const linterResult = await this.linterAgent.run(instructions, context, agentOptions);
                output = linterResult.output;
                diffs = linterResult.diffs;
                break;
            }

            default:
                output = 'Unknown agent type';
        }

        return {
            taskId: generateId(),
            agentType,
            status: 'success',
            output,
            diffs: diffs.length > 0 ? diffs : undefined,
            startedAt,
            completedAt: Date.now(),
        };
    }

    private async executeAgentWithRetry(
        agentType: AgentType,
        instructions: string,
        context: AgentContext,
        onDiff: (diff: DocumentDiff) => void,
        options: OrchestrationOptions,
        maxRetries: number = 3,
        writerVariant?: WriterVariant,
        targetLength?: TargetLength,
    ): Promise<AgentResult> {
        let lastError: Error | null = null;

        for (let attempt = 0; attempt <= maxRetries; attempt++) {
            try {
                if (attempt > 0) {
                    const delay = Math.min(1000 * Math.pow(2, attempt - 1), 5000);
                    agentLog.info(`Retrying ${agentType} (attempt ${attempt + 1}/${maxRetries + 1}) after ${delay}ms`);
                    await new Promise(resolve => setTimeout(resolve, delay));
                }

                return await this.executeAgent(agentType, instructions, context, onDiff, options, writerVariant, targetLength);
            } catch (error) {
                lastError = error instanceof Error ? error : new Error(String(error));
                const errorMsg = lastError.message;
                const isRetryable = this.isRetryableError(errorMsg);

                if (!isRetryable || attempt === maxRetries) {
                    agentLog.error(`${agentType} failed after ${attempt + 1} attempt(s)`, errorMsg);
                    throw lastError;
                }

                agentLog.warn(`${agentType} failed (attempt ${attempt + 1}/${maxRetries + 1})`, errorMsg);
            }
        }

        throw lastError || new Error(`${agentType} failed after retries`);
    }

    /**
     * Check if an error is retryable
     */
    private isRetryableError(errorMsg: string): boolean {
        const retryablePatterns = [
            'Failed to fetch',
            'Network request failed',
            'ECONNREFUSED',
            'ETIMEDOUT',
            'ENOTFOUND',
            'ECONNRESET',
            'Rate limit',
            'Too Many Requests',
            'Service error',
            '500',
            '502',
            '503',
            '504',
        ];

        return retryablePatterns.some(pattern =>
            errorMsg.toLowerCase().includes(pattern.toLowerCase())
        );
    }

    /**
     * Build a short structured summary for the summarizer agent (no raw plan markdown).
     */
    private buildSummaryForChat(
        results: AgentResult[],
        decision: RouterDecision,
        userMessage: string,
        collectedDiffs: DocumentDiff[]
    ): string {
        const lines: string[] = [];

        lines.push(`User request: ${userMessage}`);

        const totalDiffs = collectedDiffs.length;
        if (totalDiffs > 0) {
            lines.push(`Changes prepared: ${totalDiffs}`);
            const descriptions = collectedDiffs
                .slice(0, 5)
                .map(d => d.description || d.type)
                .filter(Boolean);
            if (descriptions.length > 0) {
                lines.push(`Change descriptions: ${descriptions.join('; ')}`);
            }
        } else {
            lines.push('Changes prepared: 0');
        }

        const plannerResult = results.find(r => r.agentType === 'planner');
        if (plannerResult?.output) {
            const planOneLine = plannerResult.output.split('\n').find(l => l.startsWith('## Plan:') || l.startsWith('### Objective'));
            if (planOneLine) {
                lines.push(`Plan: ${planOneLine.replace(/^#+\s*/, '').trim()}`);
            } else {
                lines.push(`Plan: ${plannerResult.output.substring(0, 120).replace(/\n/g, ' ')}...`);
            }
        }

        const researchResult = results.find(r => r.agentType === 'researcher');
        if (researchResult?.output) {
            lines.push(`Research: ${researchResult.output.substring(0, 80).replace(/\n/g, ' ')}...`);
        }

        const linterResult = results.find(r => r.agentType === 'linter');
        if (linterResult?.status === 'error') {
            lines.push(`Linter: encountered an issue. ${linterResult.error ?? ''}`);
        } else if (linterResult?.output) {
            lines.push('Linter: completed.');
        }

        const errors = results.filter(r => r.status === 'error');
        if (errors.length > 0) {
            lines.push(`Steps with issues: ${errors.map(e => e.agentType).join(', ')}`);
        }

        return lines.join('\n');
    }

    /**
     * Fallback when summarizer fails
     */
    private getFallbackResponse(collectedDiffs: DocumentDiff[], results: AgentResult[]): string {
        const totalDiffs = collectedDiffs.length;
        if (totalDiffs > 0) {
            const parts = [`I've prepared ${totalDiffs} change${totalDiffs > 1 ? 's' : ''} for your review.`];
            const failed = results.filter(r => r.status === 'error');
            if (failed.length > 0) {
                parts.push(`${failed.map(f => `${f.agentType} encountered an issue.`).join(' ')}`);
            }
            return parts.join(' ');
        }
        return "I've processed your request. Please review any proposed changes.";
    }

    /**
     * Emit an orchestration event
     */
    private emitEvent(event: OrchestrationEvent): void {
        if (this.eventHandler) {
            this.eventHandler(event);
        }
    }
}

// ==================== Main Export Function ====================

/**
 * Run the orchestration system
 */
export async function runOrchestration(
    messages: AgentMessage[],
    mentionedFiles: string[],
    options: OrchestrationOptions = {}
): Promise<OrchestrationResult> {
    agentLog.info('runOrchestration', { messageCount: messages.length, fileContext: mentionedFiles });

    // Get the last user message
    const lastUserMessage = [...messages].reverse().find(m => m.role === 'user');
    if (!lastUserMessage) {
        agentLog.warn('runOrchestration: no user message');
        return {
            success: false,
            content: 'No user message found',
            diffs: [],
            error: 'No user message found',
        };
    }

    // Build context (include image attachments so orchestration agents can send vision content)
    const context: AgentContext = {
        conversationHistory: messages,
        mentionedFiles,
        imageAttachments: lastUserMessage.imageAttachments,
    };

    // If files are mentioned, load the first one as active document (even if empty, so writer/linter get defaultFileId)
    // Prefer in-memory content (initialContentOverrides) over IndexedDB to use latest unsaved edits
    if (mentionedFiles.length > 0) {
        const fileId = mentionedFiles[0];
        let content: string;
        if (options.initialContentOverrides?.[fileId] !== undefined) {
            content = options.initialContentOverrides[fileId];
        } else {
            const { browserStorage } = await import('../../browser-storage');
            try {
                content = await browserStorage.readFile(fileId) ?? '';
            } catch {
                content = '';
            }
        }
        const fileName = fileId.split('/').pop() || fileId;
        context.activeDocument = {
            id: fileId,
            name: fileName,
            content,
        };
    }

    const provider = options.provider ?? 'openai';
    const apiKey = getApiKey(provider, options.apiKey);

    const orchestrator = new OrchestratorAgent({
        provider,
        apiKey,
        // Forward the resolved API key so EmbeddingService can use it
        // directly rather than falling back to env-var lookups.
        embeddingApiKey: provider === 'openai' ? apiKey : options.apiKey,
    });

    return orchestrator.run(lastUserMessage.fullContent || lastUserMessage.content, context, options);
}
