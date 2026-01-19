import { MarkdownPlugin, remarkMention } from '@platejs/markdown';
import { KEYS, getPluginType } from 'platejs';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';

/**
 * Custom math rules to ensure:
 * - $...$ → inline equation  
 * - $$...$$ (single or multi-line) → block equation
 */
const mathRules = {
  // Block equation: $$...$$
  equation: {
    deserialize: (mdastNode: any, _deco: any, options: any) => ({
      children: [{ text: '' }],
      texExpression: mdastNode.value || '',
      type: getPluginType(options.editor, KEYS.equation),
    }),
    serialize: (node: any) => ({
      type: 'math',
      value: node.texExpression || '',
    }),
  },
  // Inline equation: $...$
  inline_equation: {
    deserialize: (mdastNode: any, _deco: any, options: any) => ({
      children: [{ text: '' }],
      texExpression: mdastNode.value || '',
      type: getPluginType(options.editor, KEYS.inlineEquation),
    }),
    serialize: (node: any) => ({
      type: 'inlineMath',
      value: node.texExpression || '',
    }),
  },
};

export const MarkdownKit = [
  MarkdownPlugin.configure({
    options: {
      plainMarks: [KEYS.suggestion, KEYS.comment],
      remarkPlugins: [remarkMath, remarkGfm, remarkMention],
      rules: mathRules,
    },
  }),
];

/**
 * Preprocess markdown to normalize block equation syntax.
 * Converts single-line $$...$$ to multi-line format so remark-math parses as block math.
 * 
 * Input: $$x^2$$
 * Output: $$\nx^2\n$$
 * 
 * This preserves:
 * - Multi-line equations (already in correct format)
 * - Inline equations using single $ (not affected)
 */
export function preprocessMathDelimiters(markdown: string): string {
  if (!markdown) return markdown;
  
  // Match single-line $$...$$ that is NOT already multi-line
  // Uses negative lookahead/lookbehind to ensure we're matching $$...$$ not $...$
  // Pattern explanation:
  // \$\$ - opening $$
  // (?!\n) - NOT followed by newline (would mean it's already multi-line)
  // (.+?) - capture content (non-greedy, at least 1 char)
  // (?<!\n) - NOT preceded by newline before closing
  // \$\$ - closing $$
  return markdown.replace(
    /\$\$(?!\n)(.+?)(?<!\n)\$\$/g,
    (match, content) => {
      // If content is empty or only whitespace, keep as-is
      const trimmed = content.trim();
      if (!trimmed) return match;
      return `$$\n${trimmed}\n$$`;
    }
  );
}

/**
 * Postprocess markdown to normalize block equation output.
 * Ensures block equations use the single-line $$...$$ format for cleaner output.
 * 
 * Input: $$\nx^2\n$$
 * Output: $$x^2$$
 * 
 * Keeps multi-line format if the equation content itself has multiple lines.
 */
export function postprocessMathDelimiters(markdown: string): string {
  if (!markdown) return markdown;
  
  // Convert multi-line block math to single-line format
  // Match: $$ newline content newline $$
  return markdown.replace(
    /\$\$\n([\s\S]*?)\n\$\$/g,
    (match, content) => {
      const trimmed = content.trim();
      // Keep multi-line if content has multiple lines
      if (trimmed.includes('\n')) return match;
      return `$$${trimmed}$$`;
    }
  );
}

