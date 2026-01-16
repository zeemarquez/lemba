import { MarkdownPlugin, remarkMention } from '@platejs/markdown';
import { KEYS } from 'platejs';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';

export const MarkdownKit = [
  MarkdownPlugin.configure({
    options: {
      plainMarks: [KEYS.suggestion, KEYS.comment],
      remarkPlugins: [remarkMath, remarkGfm, remarkMention],
    },
  }),
];

/**
 * Simple post-processing: convert all single-$ math to double-$$ for consistency.
 * This ensures that $$...$$ format is always used in the output,
 * preventing the $$ -> $ conversion issue.
 */
export function normalizeEquationDelimiters(markdown: string): string {
  if (!markdown) return markdown;
  
  // Match single $ that's not part of $$ 
  // Pattern: $ (not preceded by $) + content (no $ or newlines) + $ (not followed by $)
  return markdown.replace(
    /(?<!\$)\$(?!\$)([^$\n]+)\$(?!\$)/g,
    '$$$$$1$$$$'  // $$ + $1 + $$ (each $$ is escaped as $$$$)
  );
}
