/**
 * Router
 *
 * Given a user message and the current document context, decide which
 * pipeline the orchestrator should run. This replaces the old, brittle
 * keyword `.includes()` based intent classification.
 *
 * The router tries an LLM call first for accurate classification. If the
 * call fails (no key, network, provider error), we fall back to a hardened
 * keyword heuristic. The keyword path is also used as a cheap pre-filter
 * when the router is explicitly disabled via options.
 */

import type { LLMProvider } from '../ai-service';
import { chatCompletion } from '../ai-service';
import type { AgentType } from './types';
import { agentLog } from '../debug';

// ==================== Types ====================

/**
 * Router intents map 1:1 to orchestrator pipeline variants. The
 * orchestrator looks up the intent and assembles the correct agent chain.
 */
export type RouterIntent =
    | 'trivial_edit'        // typo, single-phrase rename, tiny fix
    | 'targeted_edit'       // section-level edit of existing content
    | 'expand_content'      // add to an existing document
    | 'create_document'     // write a new document or a whole new major section
    | 'research_question'   // user wants information, not edits
    | 'restructure'         // reorder / dedupe sections, fix hierarchy
    | 'format_fix';         // formatting, lint, style only

/**
 * Edit scope hint. Used by the writer to pick iteration caps and by the
 * planner/linter to decide whether they should run at all.
 */
export type EditScope = 'tiny' | 'small' | 'medium' | 'large';

export interface RouterDecision {
    intent: RouterIntent;
    /** Which agents to run, in order. */
    requiredAgents: AgentType[];
    scope: EditScope;
    needsResearch: boolean;
    needsPlan: boolean;
    /** Writer variant to use, when writer is in the pipeline. */
    writerVariant?: 'quick' | 'edit' | 'create';
    /** True when the final chat response should be produced by the summarizer. */
    useSummarizer: boolean;
    /** Short (<=80 char) human explanation for the "Fast edit" / "Full workflow" pill. */
    rationale: string;
    /** Confidence 0-1, mostly informational. */
    confidence: number;
    /** Marks whether the keyword fallback was used instead of the LLM. */
    source: 'llm' | 'fallback';
}

export interface RouteOptions {
    provider: LLMProvider;
    apiKey: string;
    /** Active document stats so the router can reason about scope. */
    document?: {
        lineCount: number;
        wordCount: number;
        hasHeadings: boolean;
    };
    /** Router model; we deliberately keep this cheap. */
    model?: string;
    /** Set true to skip the LLM and go straight to the keyword fallback. */
    disableLLM?: boolean;
}

// ==================== Pipelines ====================

/**
 * Pipeline templates per intent. The router picks one of these and the
 * orchestrator strictly follows it. No more ad-hoc `structureKeywords`
 * regex splicing in the writer path.
 */
function pipelineFor(intent: RouterIntent, scope: EditScope, needsResearch: boolean, needsPlan: boolean): {
    agents: AgentType[];
    writerVariant?: 'quick' | 'edit' | 'create';
    useSummarizer: boolean;
} {
    switch (intent) {
        case 'trivial_edit':
            return { agents: ['writer'], writerVariant: 'quick', useSummarizer: false };

        case 'targeted_edit': {
            const agents: AgentType[] = [];
            if (needsResearch) agents.push('researcher');
            agents.push('writer');
            // Linter only for medium or larger edits.
            if (scope === 'medium' || scope === 'large') agents.push('linter');
            return {
                agents,
                writerVariant: 'edit',
                useSummarizer: agents.length > 1,
            };
        }

        case 'expand_content': {
            const agents: AgentType[] = [];
            if (needsPlan) agents.push('planner');
            if (needsResearch) agents.push('researcher');
            agents.push('writer');
            if (scope === 'large') agents.push('linter');
            return {
                agents,
                writerVariant: 'edit',
                useSummarizer: agents.length > 1,
            };
        }

        case 'create_document': {
            const agents: AgentType[] = ['planner'];
            if (needsResearch) agents.push('researcher');
            agents.push('writer', 'linter');
            return { agents, writerVariant: 'create', useSummarizer: true };
        }

        case 'research_question':
            return { agents: ['researcher'], useSummarizer: false };

        case 'restructure':
            return { agents: ['structure_review'], useSummarizer: true };

        case 'format_fix':
            return { agents: ['linter'], useSummarizer: false };
    }
}

// ==================== Keyword fallback ====================

interface KeywordGuess {
    intent: RouterIntent;
    scope: EditScope;
    needsResearch: boolean;
    needsPlan: boolean;
    confidence: number;
}

/**
 * Hardened keyword heuristic. Order of checks matters: we look for the
 * most specific signals first so "fix the broken structure" hits
 * `restructure` rather than `format_fix`.
 */
function keywordGuess(userMessage: string, document?: RouteOptions['document']): KeywordGuess {
    const msg = userMessage.trim();
    const lower = msg.toLowerCase();
    const wordCount = msg.split(/\s+/).filter(Boolean).length;

    const isQuestion = /\?\s*$/.test(msg) || /^(what|how|why|when|where|which|who)\b/i.test(msg);
    if (isQuestion && !/(fix|change|edit|rewrite|update|move|remove|add)/i.test(msg)) {
        return {
            intent: 'research_question',
            scope: 'tiny',
            needsResearch: true,
            needsPlan: false,
            confidence: 0.7,
        };
    }

    const restructure = /(restructure|reorganize|reorder|duplicate section|section order|hierarchy|move section|consolidate sections|dedupe headings)/i;
    if (restructure.test(lower)) {
        return { intent: 'restructure', scope: 'medium', needsResearch: false, needsPlan: false, confidence: 0.7 };
    }

    const formatOnly = /^(format|lint|clean ?up|tidy|style pass|fix formatting|normalize)/i;
    if (formatOnly.test(lower) || /fix (whitespace|formatting|markdown)/i.test(lower)) {
        return { intent: 'format_fix', scope: 'small', needsResearch: false, needsPlan: false, confidence: 0.7 };
    }

    const create = /(create|draft|write) (a|an|the)?\s*(new\s+)?(document|article|guide|tutorial|chapter|essay|report|page)/i;
    if (create.test(lower)) {
        return { intent: 'create_document', scope: 'large', needsResearch: true, needsPlan: true, confidence: 0.65 };
    }

    // Trivial: "fix typo", "rename X to Y", "change 'a' to 'b'", short request, no new-content verbs.
    const trivial = /^(fix\s+(the\s+)?typo|rename\b|replace\s+".+"\s+(with|by)\s+".+"|change\s+".+"\s+to\s+".+"|capitalize|lowercase)/i;
    if (trivial.test(lower) || (wordCount <= 10 && /(typo|spell|capitalize|lowercase|rename)/i.test(lower))) {
        return { intent: 'trivial_edit', scope: 'tiny', needsResearch: false, needsPlan: false, confidence: 0.7 };
    }

    const expand = /(expand|elaborate|add (a )?(section|paragraph|subsection|example)|extend|include more|write more)/i;
    if (expand.test(lower)) {
        const scope: EditScope = wordCount > 30 ? 'large' : 'medium';
        return { intent: 'expand_content', scope, needsResearch: scope === 'large', needsPlan: scope === 'large', confidence: 0.6 };
    }

    const targeted = /(edit|modify|rewrite|update|change|improve|revise|polish|tighten|shorten|simplify)/i;
    if (targeted.test(lower)) {
        const scope: EditScope = wordCount > 30 ? 'medium' : 'small';
        return { intent: 'targeted_edit', scope, needsResearch: false, needsPlan: false, confidence: 0.55 };
    }

    // Default: if there is an active document, assume the user wants to edit
    // something in it. If not, treat it as a research question (no edits).
    if (document) {
        return { intent: 'targeted_edit', scope: 'small', needsResearch: false, needsPlan: false, confidence: 0.4 };
    }
    return { intent: 'research_question', scope: 'tiny', needsResearch: true, needsPlan: false, confidence: 0.4 };
}

// ==================== LLM-backed router ====================

const ROUTER_SYSTEM_PROMPT = `You are the routing brain for a multi-agent markdown writing assistant.

Given the user's message and a short document summary, output a JSON object with these EXACT keys (no other keys, no renames):

{
  "intent": "<one of the allowed values below>",
  "scope": "tiny" | "small" | "medium" | "large",
  "needsResearch": true | false,
  "needsPlan": true | false,
  "rationale": "one short sentence (<= 80 chars)"
}

Allowed values for "intent":
- "trivial_edit":     typos, small phrase-level fixes, rename a term, change capitalization.
- "targeted_edit":    edit a specific sentence, paragraph, or section. Keep existing scope; do not grow the doc.
- "expand_content":   add new paragraphs/sections/examples to an existing doc.
- "create_document":  write a brand new document or a whole new long section from scratch.
- "research_question":user wants information, not edits. No changes to the document.
- "restructure":      reorder, dedupe, or re-hierarchize headings. No prose rewrites.
- "format_fix":       formatting/style/lint cleanup only.

Rules:
- The JSON key MUST be "intent" (NOT "pipeline", NOT "type", NOT "category").
- Prefer the narrowest intent that can satisfy the request (trivial > targeted > expand > create).
- "trivial_edit" and "format_fix" NEVER need research or plan.
- "restructure" NEVER touches prose (no writer agent downstream).
- Return ONLY valid JSON. No markdown, no comments, no prose outside the object.`;

interface LLMRouterOutput {
    intent: RouterIntent;
    scope: EditScope;
    needsResearch: boolean;
    needsPlan: boolean;
    rationale: string;
}

const VALID_INTENTS: readonly RouterIntent[] = [
    'trivial_edit', 'targeted_edit', 'expand_content', 'create_document',
    'research_question', 'restructure', 'format_fix',
];

const VALID_SCOPES: readonly EditScope[] = ['tiny', 'small', 'medium', 'large'];

/**
 * Try to extract a JSON object out of an LLM response. Tolerates code
 * fences, surrounding prose, and responses that are "almost JSON" with
 * trailing or leading noise.
 */
function extractJsonObject(raw: string): unknown | null {
    const trimmed = raw.trim();
    const fenced = trimmed.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();

    // Fast path: the whole thing parses.
    try { return JSON.parse(fenced); } catch { /* fallthrough */ }

    // Fallback: find the first `{...}` block and try that.
    const first = fenced.indexOf('{');
    const last = fenced.lastIndexOf('}');
    if (first !== -1 && last > first) {
        const slice = fenced.slice(first, last + 1);
        try { return JSON.parse(slice); } catch { /* ignore */ }
    }
    return null;
}

function parseRouterJson(raw: string): LLMRouterOutput | null {
    const parsedUnknown = extractJsonObject(raw);
    if (!parsedUnknown || typeof parsedUnknown !== 'object') return null;
    const parsed = parsedUnknown as Record<string, unknown>;

    // Be lenient about the key name. Different providers and prompt drift
    // have produced "pipeline", "type", "category", and even "decision"
    // where we expected "intent". Treat any of them as an intent alias so
    // a valid routing decision doesn't silently fall back to keywords.
    const intentRaw =
        (parsed.intent as string | undefined) ??
        (parsed.pipeline as string | undefined) ??
        (parsed.type as string | undefined) ??
        (parsed.category as string | undefined) ??
        (parsed.decision as string | undefined);

    const intent = VALID_INTENTS.includes(intentRaw as RouterIntent) ? (intentRaw as RouterIntent) : undefined;

    const scopeRaw = (parsed.scope as string | undefined) ?? (parsed.size as string | undefined);
    const scope = VALID_SCOPES.includes(scopeRaw as EditScope) ? (scopeRaw as EditScope) : undefined;

    if (!intent || !scope) return null;

    // `needs_research` / `needs_plan` snake_case aliases are also common.
    const needsResearch = Boolean(
        parsed.needsResearch ?? parsed.needs_research ?? parsed.research,
    );
    const needsPlan = Boolean(
        parsed.needsPlan ?? parsed.needs_plan ?? parsed.plan,
    );
    const rationale = typeof parsed.rationale === 'string'
        ? (parsed.rationale as string).slice(0, 120)
        : typeof parsed.reason === 'string'
            ? (parsed.reason as string).slice(0, 120)
            : '';

    return { intent, scope, needsResearch, needsPlan, rationale };
}

function cheapModelFor(provider: LLMProvider): string {
    switch (provider) {
        case 'openai':    return 'gpt-4o-mini';
        case 'anthropic': return 'claude-3-5-haiku-latest';
        case 'google':    return 'gemini-2.0-flash';
    }
}

function buildDocumentSummary(doc?: RouteOptions['document']): string {
    if (!doc) return 'No active document.';
    return `Active document: ${doc.lineCount} lines, ~${doc.wordCount} words, ${doc.hasHeadings ? 'has headings' : 'no headings'}.`;
}

/**
 * Decide which pipeline to run for this user message. Always returns a
 * decision - falls back to the keyword heuristic on any LLM failure so the
 * assistant remains usable without internet or keys.
 */
export async function route(userMessage: string, options: RouteOptions): Promise<RouterDecision> {
    const fallback = keywordGuess(userMessage, options.document);

    if (options.disableLLM || !options.apiKey) {
        return buildDecision(fallback, 'fallback');
    }

    try {
        const response = await chatCompletion({
            provider: options.provider,
            apiKey: options.apiKey,
            // Stay on a cheap model; router accuracy does not require a flagship.
            model: options.model ?? cheapModelFor(options.provider),
            messages: [
                { role: 'system', content: ROUTER_SYSTEM_PROMPT },
                {
                    role: 'user',
                    content: `${buildDocumentSummary(options.document)}\n\nUser message: ${userMessage}\n\nRespond with JSON only.`,
                },
            ],
            temperature: 0,
            maxTokens: 200,
        });

        const parsed = parseRouterJson(response);
        if (!parsed) {
            agentLog.warn('router: could not parse LLM JSON, falling back', { raw: response });
            return buildDecision(fallback, 'fallback');
        }

        return buildDecision(
            {
                intent: parsed.intent,
                scope: parsed.scope,
                needsResearch: parsed.needsResearch,
                needsPlan: parsed.needsPlan,
                confidence: 0.9,
            },
            'llm',
            parsed.rationale,
        );
    } catch (error) {
        agentLog.warn('router: LLM call failed, falling back', String(error));
        return buildDecision(fallback, 'fallback');
    }
}

function buildDecision(guess: KeywordGuess, source: 'llm' | 'fallback', rationale?: string): RouterDecision {
    const pipe = pipelineFor(guess.intent, guess.scope, guess.needsResearch, guess.needsPlan);
    return {
        intent: guess.intent,
        requiredAgents: pipe.agents,
        scope: guess.scope,
        needsResearch: guess.needsResearch,
        needsPlan: guess.needsPlan,
        writerVariant: pipe.writerVariant,
        useSummarizer: pipe.useSummarizer,
        rationale: rationale ?? defaultRationale(guess.intent, guess.scope),
        confidence: guess.confidence,
        source,
    };
}

function defaultRationale(intent: RouterIntent, scope: EditScope): string {
    switch (intent) {
        case 'trivial_edit':     return 'Small targeted fix';
        case 'targeted_edit':    return `Targeted ${scope} edit`;
        case 'expand_content':   return `Expanding document (${scope})`;
        case 'create_document':  return 'Creating new content';
        case 'research_question':return 'Research only';
        case 'restructure':      return 'Document restructure';
        case 'format_fix':       return 'Formatting cleanup';
    }
}

/** Public-facing label for the UI pill. */
export function decisionLabel(decision: RouterDecision): string {
    switch (decision.intent) {
        case 'trivial_edit':     return 'Fast edit';
        case 'targeted_edit':    return decision.scope === 'small' ? 'Fast edit' : 'Targeted edit';
        case 'expand_content':   return 'Expand';
        case 'create_document':  return 'Full workflow';
        case 'research_question':return 'Research';
        case 'restructure':      return 'Restructure';
        case 'format_fix':       return 'Format pass';
    }
}
