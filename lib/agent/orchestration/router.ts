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
    /**
     * Target output length for writer agents. Populated when the user
     * explicitly asked for an "extensive" / "comprehensive" / "detailed"
     * document, or for a long new section. Writers use this as a concrete
     * target, not a ceiling.
     */
    targetLength?: TargetLength;
}

export interface TargetLength {
    /** Lower bound - writers should not produce content shorter than this. */
    minWords: number;
    /** Aim - writer prompts target this word count. */
    targetWords: number;
    /** Optional structural guidance: aim for at least this many top-level sections. */
    minSections?: number;
    /** Human-readable descriptor for logs and prompts ("extensive", etc.). */
    label: string;
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
            // Large expansions get the 'create' variant with higher iteration
            // caps and stronger length-target enforcement.
            const variant = scope === 'large' ? 'create' : 'edit';
            return {
                agents,
                writerVariant: variant,
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
    targetLength?: TargetLength;
}

/**
 * Detect explicit length signals in the user's message. When the user
 * asks for an "extensive", "comprehensive", "in-depth", "detailed",
 * "thorough", "long", or "complete" document, we compute a concrete word
 * count target that the writer will use as a floor (not a ceiling).
 *
 * We also handle explicit numeric requests such as "around 2000 words" or
 * "at least 10 pages" so writers don't undershoot on specific asks.
 */
function detectTargetLength(message: string): TargetLength | undefined {
    const lower = message.toLowerCase();

    const wordMatch = lower.match(/(\d{3,5})\s*(?:\+\s*)?words?/);
    if (wordMatch) {
        const n = parseInt(wordMatch[1], 10);
        if (!Number.isNaN(n)) {
            return {
                minWords: Math.round(n * 0.85),
                targetWords: n,
                minSections: Math.max(3, Math.round(n / 400)),
                label: `${n} words`,
            };
        }
    }

    const pageMatch = lower.match(/(\d{1,3})\s*(?:\+\s*)?pages?/);
    if (pageMatch) {
        const pages = parseInt(pageMatch[1], 10);
        if (!Number.isNaN(pages)) {
            const target = pages * 500;
            return {
                minWords: Math.round(target * 0.85),
                targetWords: target,
                minSections: Math.max(3, pages),
                label: `${pages} pages`,
            };
        }
    }

    if (/(exhaustive|encyclopedic|encyclopaedic|book[- ]length|monograph)/.test(lower)) {
        return { minWords: 3500, targetWords: 5000, minSections: 10, label: 'exhaustive' };
    }
    if (/(extensive|comprehensive|in[- ]depth|deep[- ]dive|thorough|complete guide|full(?:-|\s)length)/.test(lower)) {
        return { minWords: 1800, targetWords: 2500, minSections: 6, label: 'extensive' };
    }
    if (/(detailed|long|lengthy|expanded|elaborate|rich)/.test(lower)) {
        return { minWords: 900, targetWords: 1400, minSections: 4, label: 'detailed' };
    }
    return undefined;
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
    const targetLength = detectTargetLength(msg);

    const isQuestion = /\?\s*$/.test(msg) || /^(what|how|why|when|where|which|who)\b/i.test(msg);
    if (isQuestion && !/(fix|change|edit|rewrite|update|move|remove|add|dedupe|deduplicate|duplicate)/i.test(msg)) {
        return {
            intent: 'research_question',
            scope: 'tiny',
            needsResearch: true,
            needsPlan: false,
            confidence: 0.7,
        };
    }

    // Dedupe / duplicate-content cleanup is a restructure intent, even when
    // the user phrases it as "remove duplicates" without the word section.
    // We deliberately check this BEFORE the generic targeted/edit bucket.
    const dedupe = /(dedup(licate|e)?|duplicate(d)?\b|duplicates\b|redundant|repeated (content|information|text))/i;
    if (dedupe.test(lower)) {
        return { intent: 'restructure', scope: 'medium', needsResearch: false, needsPlan: false, confidence: 0.75 };
    }

    const restructure = /(restructure|reorganize|reorder|duplicate section|section order|hierarchy|move section|consolidate sections|dedupe headings)/i;
    if (restructure.test(lower)) {
        return { intent: 'restructure', scope: 'medium', needsResearch: false, needsPlan: false, confidence: 0.7 };
    }

    const formatOnly = /^(format|lint|clean ?up|tidy|style pass|fix formatting|normalize)/i;
    if (formatOnly.test(lower) || /fix (whitespace|formatting|markdown)/i.test(lower)) {
        return { intent: 'format_fix', scope: 'small', needsResearch: false, needsPlan: false, confidence: 0.7 };
    }

    const create = /(create|draft|write|generate|produce|compose) (a|an|the)?\s*(new\s+|full\s+|complete\s+|extensive\s+|comprehensive\s+|detailed\s+|in[- ]depth\s+|long\s+|thorough\s+)?(document|article|guide|tutorial|chapter|essay|report|page|paper|overview|primer|introduction to|explanation of)/i;
    if (create.test(lower)) {
        // Explicit length signal always wins - large scope, high confidence.
        const scope: EditScope = 'large';
        return {
            intent: 'create_document',
            scope,
            needsResearch: true,
            needsPlan: true,
            confidence: 0.75,
            targetLength,
        };
    }

    // Trivial: "fix typo", "rename X to Y", "change 'a' to 'b'", short request, no new-content verbs.
    const trivial = /^(fix\s+(the\s+)?typo|rename\b|replace\s+".+"\s+(with|by)\s+".+"|change\s+".+"\s+to\s+".+"|capitalize|lowercase)/i;
    if (trivial.test(lower) || (wordCount <= 10 && /(typo|spell|capitalize|lowercase|rename)/i.test(lower))) {
        return { intent: 'trivial_edit', scope: 'tiny', needsResearch: false, needsPlan: false, confidence: 0.7 };
    }

    const expand = /(expand|elaborate|add (a )?(section|paragraph|subsection|example)|extend|include more|write more|make .* (longer|more detailed|more extensive|more comprehensive))/i;
    if (expand.test(lower)) {
        const scope: EditScope = targetLength || wordCount > 30 ? 'large' : 'medium';
        return {
            intent: 'expand_content',
            scope,
            needsResearch: scope === 'large',
            needsPlan: scope === 'large',
            confidence: 0.6,
            targetLength,
        };
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
- "restructure":      reorder sections, detect/remove duplicate content, consolidate overlapping sections, fix hierarchy. Use this for ANY deduplication request (e.g. "remove duplicates", "dedupe", "there is duplicate information").
- "format_fix":       formatting/style/lint cleanup only.

Rules:
- The JSON key MUST be "intent" (NOT "pipeline", NOT "type", NOT "category").
- Prefer the narrowest intent that can satisfy the request (trivial > targeted > expand > create).
- Requests to "remove duplicates", "find duplicate content", "deduplicate", or "consolidate repeated information" are ALWAYS "restructure", never "targeted_edit".
- When the user explicitly asks for an "extensive" / "comprehensive" / "in-depth" / "detailed" / "thorough" document, or requests a brand new document, you MUST set intent to "create_document" (or "expand_content" when adding to an existing doc) AND scope to "large".
- "trivial_edit" and "format_fix" NEVER need research or plan.
- "restructure" NEVER touches prose (no writer agent downstream).
- Scope hints: tiny (single-line), small (one paragraph), medium (one section, <= 300 words), large (multi-section, > 500 words, or any "extensive"/"comprehensive" request).
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

        // Length detection is deterministic and cheap; always run it so the
        // writer gets a concrete target even if the LLM didn't think about it.
        const targetLength = detectTargetLength(userMessage) ?? fallback.targetLength;

        // If user explicitly asked for an extensive/comprehensive doc, force
        // large scope even when the LLM picked something smaller.
        const effectiveScope: EditScope = targetLength && parsed.scope !== 'large'
            ? 'large'
            : parsed.scope;

        return buildDecision(
            {
                intent: parsed.intent,
                scope: effectiveScope,
                needsResearch: parsed.needsResearch || Boolean(targetLength && parsed.intent === 'create_document'),
                needsPlan: parsed.needsPlan || Boolean(targetLength && (parsed.intent === 'create_document' || parsed.intent === 'expand_content')),
                confidence: 0.9,
                targetLength,
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
        targetLength: guess.targetLength,
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
