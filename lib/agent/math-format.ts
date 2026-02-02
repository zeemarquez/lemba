/**
 * Math format normalizer for markdown (code + regex only, no AI).
 * Ensures proposed agent content follows project rules for math before proposing changes.
 *
 * Rules applied:
 * - Block math: `$$ ... $$` on one continuous line with a space after opening and before closing.
 * - LaTeX block `\[ ... \]` is converted to `$$ ... $$` on one line.
 * - Multi-line block math (e.g. $$\n...\n$$) is collapsed to one line.
 * - Blank line before and after each block equation.
 * - Inline math `$...$` is left as-is (no newlines inside recommended but not forced).
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
