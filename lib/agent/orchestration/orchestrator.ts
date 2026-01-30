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
    AgentTask,
    AgentResult,
    Workflow,
    WorkflowStep,
    IntentAnalysis,
    UserIntent,
    TaskStatus,
    OrchestrationEvent,
    OrchestrationEventHandler,
    DEFAULT_AGENT_CONFIGS,
    generateId,
} from './types';
import { ToolRegistry, defaultToolRegistry, TOOL_DEFINITIONS } from './tools';
import { RAGEngine, defaultRAGEngine } from './rag';
import { PlannerAgent } from './agents/planner';
import { ResearcherAgent } from './agents/researcher';
import { WriterAgent } from './agents/writer';
import { LinterAgent } from './agents/linter';
import { SummarizerAgent } from './agents/summarizer';

import { ORCHESTRATOR_PROMPT } from './prompts';

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
}

export interface OrchestrationResult {
    success: boolean;
    content: string;
    diffs: DocumentDiff[];
    workflow?: Workflow;
    error?: string;
}

// ==================== Orchestrator Agent ====================

export class OrchestratorAgent {
    private toolRegistry: ToolRegistry;
    private ragEngine: RAGEngine;
    private plannerAgent: PlannerAgent;
    private researcherAgent: ResearcherAgent;
    private writerAgent: WriterAgent;
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
        } = {}
    ) {
        this.toolRegistry = options.toolRegistry || defaultToolRegistry;
        this.ragEngine = options.ragEngine || defaultRAGEngine;
        this.provider = options.provider ?? 'openai';
        this.apiKey = getApiKey(this.provider, options.apiKey);

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

        const onDiff = (diff: DocumentDiff) => {
            collectedDiffs.push(diff);
            if (options.onDiffCreated) {
                options.onDiffCreated(diff);
            }
            this.emitEvent({ type: 'diff_created', diff });
        };

        try {
            // Step 1: Analyze user intent
            const intent = await this.analyzeIntent(userMessage, context);

            // Step 2: Create workflow based on intent
            const workflow = this.createWorkflow(userMessage, intent, context);
            this.emitEvent({ type: 'workflow_started', workflow });

            // Step 3: Execute workflow steps
            let lastResult: AgentResult | null = null;
            const results: AgentResult[] = [];

            for (let i = 0; i < workflow.steps.length; i++) {
                const step = workflow.steps[i];
                workflow.currentStepIndex = i;
                step.status = 'in_progress';
                this.emitEvent({ type: 'step_started', step });
                agentLog.step(`step ${i + 1}/${workflow.steps.length}: ${step.agentType}`, { taskType: step.taskType });

                // Skip if read-only and step would make edits
                if (options.readOnly && (step.agentType === 'writer' || step.agentType === 'linter')) {
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
                    // Build context for this step
                    const stepContext = this.buildStepContext(context, results, workflow);

                    // Execute the appropriate agent
                    const result = await this.executeAgent(
                        step.agentType,
                        step.instructions,
                        stepContext,
                        onDiff,
                        options
                    );

                    step.status = result.status;
                    step.result = result;
                    results.push(result);
                    lastResult = result;
                    agentLog.step(`step ${step.agentType} done`, { status: result.status, outputLength: result.output?.length ?? 0, diffs: result.diffs?.length ?? 0 });

                    // Collect diffs from result
                    if (result.diffs) {
                        collectedDiffs.push(...result.diffs);
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

            // Step 5: Build concise chat message (no raw plan/linter output)
            workflow.status = 'success';
            let finalContent: string;
            if (intent.primaryIntent === 'question') {
                const researchResult = results.find(r => r.agentType === 'researcher');
                finalContent = researchResult?.output ?? "I couldn't find an answer. Please try rephrasing.";
            } else {
                const summaryInput = this.buildSummaryForChat(results, intent, userMessage, collectedDiffs);
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
            };

        } catch (error) {
            const errorMsg = String(error);
            agentLog.error('orchestration failed', errorMsg);
            return {
                success: false,
                content: `I encountered an error while processing your request: ${errorMsg}`,
                diffs: collectedDiffs,
                error: errorMsg,
            };
        }
    }

    /**
     * Analyze user intent from the message
     */
    private async analyzeIntent(
        userMessage: string,
        context: AgentContext
    ): Promise<IntentAnalysis> {
        // Simple keyword-based intent classification
        // In a production system, this could use an LLM call
        const message = userMessage.toLowerCase();

        let primaryIntent: UserIntent = 'unknown';
        let requiredAgents: AgentType[] = ['orchestrator'];

        // Determine intent based on keywords and patterns
        if (message.includes('create') || message.includes('write') || message.includes('draft')) {
            if (message.includes('document') || message.includes('new file')) {
                primaryIntent = 'create_document';
                requiredAgents = ['planner', 'researcher', 'writer', 'linter'];
            } else {
                primaryIntent = 'expand_content';
                requiredAgents = ['researcher', 'planner', 'writer', 'linter'];
            }
        } else if (message.includes('edit') || message.includes('modify') || message.includes('change') || message.includes('update')) {
            primaryIntent = 'edit_section';
            requiredAgents = ['researcher', 'writer', 'linter'];
        } else if (message.includes('expand') || message.includes('add more') || message.includes('elaborate')) {
            primaryIntent = 'expand_content';
            requiredAgents = ['researcher', 'planner', 'writer', 'linter'];
        } else if (message.includes('summarize') || message.includes('summary') || message.includes('condense')) {
            primaryIntent = 'summarize';
            requiredAgents = ['researcher', 'writer'];
        } else if (message.includes('research') || message.includes('find') || message.includes('search')) {
            primaryIntent = 'research';
            requiredAgents = ['researcher'];
        } else if (message.includes('reorganize') || message.includes('restructure') || message.includes('reorder')) {
            primaryIntent = 'reorganize';
            requiredAgents = ['planner', 'writer', 'linter'];
        } else if (message.includes('fix') || message.includes('error') || message.includes('broken')) {
            primaryIntent = 'fix_errors';
            requiredAgents = ['linter'];
        } else if (message.includes('format') || message.includes('style') || message.includes('clean up')) {
            primaryIntent = 'format';
            requiredAgents = ['linter', 'writer'];
        } else if (message.includes('review') || message.includes('check') || message.includes('analyze')) {
            primaryIntent = 'review';
            requiredAgents = ['researcher', 'linter'];
        } else if (message.includes('?') || message.includes('what') || message.includes('how') || message.includes('why')) {
            primaryIntent = 'question';
            requiredAgents = ['researcher'];
        }

        // Check if document is long (needs RAG)
        if (context.activeDocument) {
            const lineCount = context.activeDocument.content.split('\n').length;
            if (lineCount > 100 && !requiredAgents.includes('researcher')) {
                // Add researcher for RAG context on long documents
                requiredAgents.unshift('researcher');
            }
        }

        return {
            primaryIntent,
            confidence: 0.8, // Placeholder confidence
            requiredAgents,
            targetSections: this.extractTargetSections(userMessage),
            suggestedWorkflow: this.createWorkflowSteps(requiredAgents, userMessage, primaryIntent),
        };
    }

    /**
     * Extract target sections from user message
     */
    private extractTargetSections(message: string): string[] {
        const sections: string[] = [];

        // Look for quoted section names
        const quotedMatches = message.match(/"([^"]+)"/g);
        if (quotedMatches) {
            sections.push(...quotedMatches.map(m => m.replace(/"/g, '')));
        }

        // Look for "section" keyword
        const sectionMatch = message.match(/(?:section|chapter|part)\s+(?:on|about|called|named)?\s*["']?(\w[\w\s]+)["']?/i);
        if (sectionMatch) {
            sections.push(sectionMatch[1].trim());
        }

        return sections;
    }

    /**
     * Create workflow steps for required agents
     */
    private createWorkflowSteps(
        agents: AgentType[],
        userMessage: string,
        intent: UserIntent
    ): WorkflowStep[] {
        return agents.map((agentType, index) => ({
            id: generateId(),
            agentType,
            taskType: this.getTaskTypeForAgent(agentType),
            instructions: this.generateInstructions(agentType, userMessage, intent),
            dependsOn: index > 0 ? [agents[index - 1]] : undefined,
            status: 'pending' as TaskStatus,
        }));
    }

    /**
     * Get task type for agent
     */
    private getTaskTypeForAgent(agentType: AgentType): 'plan' | 'research' | 'write' | 'lint' | 'orchestrate' {
        switch (agentType) {
            case 'planner': return 'plan';
            case 'researcher': return 'research';
            case 'writer': return 'write';
            case 'linter': return 'lint';
            default: return 'orchestrate';
        }
    }

    /**
     * Generate instructions for an agent based on intent
     */
    private generateInstructions(
        agentType: AgentType,
        userMessage: string,
        intent: UserIntent
    ): string {
        const baseContext = `User request: "${userMessage}"`;

        switch (agentType) {
            case 'planner':
                return `${baseContext}\n\nCreate a structured plan for this request. Break down the task into clear, actionable steps.`;
            case 'researcher':
                if (intent === 'question') {
                    return `${baseContext}\n\nFind information to answer this question. Use RAG to search documents and web search if needed.`;
                }
                return `${baseContext}\n\nGather relevant information for this task. Use RAG for document context and web search for external information.`;
            case 'writer':
                return `${baseContext}\n\nWrite or edit content based on the plan and research provided. Follow markdown best practices.`;
            case 'linter':
                return `${baseContext}\n\nCheck the document for errors and style issues. Propose fixes for any problems found.`;
            default:
                return baseContext;
        }
    }

    /**
     * Create a workflow from intent analysis
     */
    private createWorkflow(
        userMessage: string,
        intent: IntentAnalysis,
        context: AgentContext
    ): Workflow {
        return {
            id: generateId(),
            userRequest: userMessage,
            steps: intent.suggestedWorkflow,
            currentStepIndex: 0,
            status: 'pending',
            context: { ...context },
            createdAt: Date.now(),
            updatedAt: Date.now(),
        };
    }

    /**
     * Build context for a workflow step
     */
    private buildStepContext(
        baseContext: AgentContext,
        previousResults: AgentResult[],
        workflow: Workflow
    ): AgentContext {
        return {
            ...baseContext,
            planOutline: workflow.context.planOutline,
            researchFindings: workflow.context.researchFindings,
            previousResults,
        };
    }

    /**
     * Execute a specific agent
     */
    private async executeAgent(
        agentType: AgentType,
        instructions: string,
        context: AgentContext,
        onDiff: (diff: DocumentDiff) => void,
        options: OrchestrationOptions
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
                const writerResult = await this.writerAgent.run(instructions, context, agentOptions);
                output = writerResult.output;
                diffs = writerResult.diffs;
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

    /**
     * Build a short structured summary for the summarizer agent (no raw plan markdown).
     */
    private buildSummaryForChat(
        results: AgentResult[],
        intent: IntentAnalysis,
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

    // Build context
    const context: AgentContext = {
        conversationHistory: messages,
        mentionedFiles,
    };

    // If files are mentioned, load the first one as active document
    if (mentionedFiles.length > 0) {
        const { browserStorage } = await import('../../browser-storage');
        const content = await browserStorage.readFile(mentionedFiles[0]);
        if (content) {
            const fileName = mentionedFiles[0].split('/').pop() || mentionedFiles[0];
            context.activeDocument = {
                id: mentionedFiles[0],
                name: fileName,
                content,
            };
        }
    }

    const provider = options.provider ?? 'openai';
    const apiKey = getApiKey(provider, options.apiKey);

    const orchestrator = new OrchestratorAgent({
        provider,
        apiKey,
    });

    return orchestrator.run(lastUserMessage.content, context, options);
}

// Export class
export { OrchestratorAgent };
