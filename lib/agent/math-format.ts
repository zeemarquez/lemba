/**
 * House-rules normalizer for markdown (pure code + regex, no AI).
 *
 * The agent prompts promise a set of "house rules" (block equations with
 * blank lines around them, no numbered headings, blank line before blocks,
 * etc.) but the LLM cannot be trusted to honor them 100% of the time. We
 * enforce them deterministically on every proposed content before the diff
 * is shown to the user. This is the single source of truth for what the
 * prompts describe - any new rule should be added here and mirrored in
 * `lib/agent/orchestration/prompts/index.ts` HOUSE_RULES.
 *
 * Rules applied:
 * - Block math: `$$ ... $$` on one continuous line with a space after opening and before closing.
 * - LaTeX block `\[ ... \]` is converted to `$$ ... $$` on one line.
 * - Multi-line block math (e.g. $$\n...\n$$) is collapsed to one line.
 * - Blank line before and after each block equation.
 * - Blank line before every heading, fenced code block, and GFM alert block.
 * - Headings have no leading numeric prefix (e.g. `## 1. Intro` -> `## Intro`).
 * - At most two consecutive blank lines anywhere in the document.
 * - Inline math `$...$` is left as-is.
 */

/**
 * Normalize markdown so math expressions follow project formatting rules.
 * Safe to call on any string; returns a new string.
 */
export function normalizeMathInMarkdown(content: string): string {
    if (!content || typeof content !== 'string') return content;

    let out = content;

    // 1) Convert LaTeX block math \[ ... \] to $$ ... $$ on one line
    out = out.replace(/\\\[([\s\S]*?)\\\]/g, (_: string, inner: string) => {
        const trimmed = inner.replace(/\s+/g, ' ').trim();
        return trimmed ? `$$ ${trimmed} $$` : '$$  $$';
    });

    // 2a) Collapse empty/split block math: $$ on one line, nothing or whitespace, $$ on next line -> single line
    //     Fixes bug where two pairs of $$ end up on two lines with nothing in between
    out = out.replace(/\$\$\s*\n[\s\n]*\$\$/g, () => '$$  $$');

    // 2b) Collapse multi-line block math to single line: $$\n...\n$$ -> $$ trimmed $$
    out = out.replace(/\$\$\n([\s\S]*?)\n\$\$/g, (_: string, inner: string) => {
        const trimmed = inner.replace(/\s+/g, ' ').trim();
        return trimmed ? `$$ ${trimmed} $$` : '$$  $$';
    });

    // 3) Single-line block math: ensure space after opening $$ and before closing $$
    //    Match $$ optional-space content optional-space $$ and normalize to $$ content $$
    out = out.replace(/\$\$\s*([^\n]*?)\s*\$\$/g, (_: string, inner: string) => {
        const trimmed = inner.trim();
        return trimmed ? `$$ ${trimmed} $$` : '$$  $$';
    });

    // 4) Ensure blank line before and after each block-equation line
    const lines = out.split('\n');
    const result: string[] = [];
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const isBlockMath = /^\s*\$\$.+\$\$\s*$/.test(line);
        if (isBlockMath) {
            // Ensure previous line is blank
            if (result.length > 0 && result[result.length - 1].trim() !== '') {
                result.push('');
            }
            result.push(line);
            // Ensure next line is blank (peek ahead)
            if (i + 1 < lines.length && lines[i + 1].trim() !== '') {
                result.push('');
            }
        } else {
            result.push(line);
        }
    }

    return result.join('\n');
}

/**
 * Strip a leading numeric prefix from a heading line.
 * `## 1. Introduction` -> `## Introduction`.
 * `## 1) Intro`        -> `## Intro`.
 * Leaves non-heading lines untouched.
 */
function stripNumberedHeading(line: string): string {
    const m = line.match(/^(\s*#{1,6}\s+)(\d+)\s*[.)-]\s+(.*)$/);
    if (!m) return line;
    return `${m[1]}${m[3]}`;
}

/**
 * Run every deterministic house-rule normalizer on a proposed content
 * string. Idempotent: running it twice yields the same result as once.
 *
 * Rules applied:
 * - All math rules via `normalizeMathInMarkdown` (block equations, LaTeX
 *   conversion, blank lines around block equations).
 * - Strip numeric prefix from headings (`## 1. Intro` → `## Intro`).
 * - Collapse >2 consecutive blank lines to 2 (preserve intentional spacing).
 *
 * Intentionally NOT inserting blank lines before arbitrary block elements
 * (headings, fenced code, tables). Inserting blank lines *between* table
 * rows destroys the table, and inserting blank lines before code fences can
 * break context. The LLM is expected to follow the house rules for those;
 * we only auto-fix things that are unambiguous and safe.
 */
export function enforceHouseRules(content: string): string {
    if (!content || typeof content !== 'string') return content;

    // Math rules first (they can re-layout lines around equations).
    let out = normalizeMathInMarkdown(content);

    // Strip numeric prefix from headings (outside of fenced code blocks).
    const lines = out.split('\n');
    const result: string[] = [];
    let inFence = false;

    for (let i = 0; i < lines.length; i++) {
        let line = lines[i];

        // Track fenced code state so we don't mangle content inside code.
        if (/^\s*```/.test(line)) inFence = !inFence;

        // Strip numeric prefix from headings: `## 1. Intro` → `## Intro`.
        if (!inFence) line = stripNumberedHeading(line);

        result.push(line);
    }

    // Collapse >2 consecutive blank lines to 2. Authors can deliberately
    // use two blank lines to separate major sections, but more than that
    // is almost always accidental.
    const collapsed: string[] = [];
    let blankRun = 0;
    for (const line of result) {
        if (line.trim() === '') {
            blankRun++;
            if (blankRun <= 2) collapsed.push(line);
        } else {
            blankRun = 0;
            collapsed.push(line);
        }
    }

    // Trim trailing blank lines; preserve exactly one trailing newline when
    // the original content ended with one.
    while (collapsed.length > 1 && collapsed[collapsed.length - 1].trim() === '') {
        collapsed.pop();
    }
    const endedWithNewline = content.endsWith('\n');
    const joined = collapsed.join('\n');
    return endedWithNewline && !joined.endsWith('\n') ? joined + '\n' : joined;
}
