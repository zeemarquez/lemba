import { MarkdownPlugin, convertChildrenDeserialize, remarkMention } from '@platejs/markdown';
import { KEYS, NodeApi, getPluginType } from 'platejs';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import { ELEMENT_PAGE_BREAK } from './page-break-plugin';
import { KEY_PLACEHOLDER } from './placeholder-kit';

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

/**
 * Page break rules for markdown serialization/deserialization
 * Uses HTML comment format: <!-- pagebreak -->
 */
const pageBreakRules = {
  [ELEMENT_PAGE_BREAK]: {
    serialize: () => ({
      type: 'html',
      value: '<!-- pagebreak -->',
    }),
  },
  html: {
    deserialize: (mdastNode: any, _deco: any, options: any) => {
      const value = mdastNode.value?.trim();

      // Check for page break comment
      if (value === '<!-- pagebreak -->') {
        return {
          type: getPluginType(options.editor, ELEMENT_PAGE_BREAK),
          children: [{ text: '' }],
        };
      }

      // Handle image HTML (original html deserialize logic will be merged)
      const imgMatch = value?.match(/<img[^>]*src="([^"]*)"[^>]*>/);

      if (imgMatch) {
        const url = imgMatch[1];
        const widthMatch = value.match(/width\s*:\s*(\d+)px/);
        const heightMatch = value.match(/height\s*:\s*(\d+)px/);
        const altMatch = value.match(/alt\s*=\s*"([^"]*)"/i);
        const idMatch = value.match(/id\s*=\s*"([^"]*)"/i);
        const captionMatch = value.match(/figcaption\s*=\s*"([^"]*)"/i);
        // Try data-align first, then fall back to detecting margin pattern
        const dataAlignMatch = value.match(/data-align\s*=\s*"(left|center|right)"/i);
        let align: string | undefined;

        if (dataAlignMatch) {
          align = dataAlignMatch[1];
        } else if (value.includes('margin-left: auto') && value.includes('margin-right: auto')) {
          align = 'center';
        } else if (value.includes('margin-left: auto') && value.includes('margin-right: 0')) {
          align = 'right';
        } else if (value.includes('margin-left: 0')) {
          align = 'left';
        }

        return {
          type: getPluginType(options.editor, KEYS.img),
          url,
          width: widthMatch ? parseInt(widthMatch[1]) : undefined,
          height: heightMatch ? parseInt(heightMatch[1]) : undefined,
          alt: altMatch ? altMatch[1] : undefined,
          id: idMatch ? idMatch[1] : undefined,
          align,
          caption: captionMatch ? [{ text: captionMatch[1] }] : undefined,
          children: [{ text: '' }],
        };
      }

      // Return as text for other HTML
      return { text: mdastNode.value };
    },
  },
};

const imageRules = {
  [KEYS.img]: {
    serialize: (node: any) => {
      const { url, width, height, alt, align, caption, id } = node;
      if (width || height || align || caption || id) {
        // Build style for alignment using margin (more reliable than text-align)
        const styles: string[] = ['display: block'];
        if (width) styles.push(`width: ${width}px`);
        if (height) styles.push(`height: ${height}px`);

        // Apply alignment via margin
        if (align === 'center') {
          styles.push('margin-left: auto', 'margin-right: auto');
        } else if (align === 'right') {
          styles.push('margin-left: auto', 'margin-right: 0');
        } else {
          styles.push('margin-left: 0', 'margin-right: auto');
        }

        let attrs = `src="${url}"`;
        if (alt) attrs += ` alt="${alt}"`;
        if (id) attrs += ` id="${id}"`;
        attrs += ` style="${styles.join('; ')}"`;
        // Store alignment as data attribute for deserialization
        if (align) attrs += ` data-align="${align}"`;

        // Handle caption
        if (caption && Array.isArray(caption) && caption.length > 0) {
          const captionText = NodeApi.string({ children: caption } as any);
          if (captionText) {
            attrs += ` figcaption="${captionText.replace(/"/g, '&quot;')}"`;
          }
        }

        return {
          type: 'html',
          value: `<img ${attrs} />`,
        };
      }
      return {
        type: 'image',
        url,
        alt,
      };
    },
  },
  image: {
    deserialize: (mdastNode: any, _deco: any, options: any) => ({
      type: getPluginType(options.editor, KEYS.img),
      url: mdastNode.url,
      alt: mdastNode.alt,
      children: [{ text: '' }],
    }),
  },
  // html deserialize is handled in pageBreakRules to handle both page breaks and images
};

const alertRules = {
  blockquote: {
    deserialize: (mdastNode: any, deco: any, options: any) => {
      const firstChild = mdastNode.children?.[0];
      if (firstChild?.type === 'paragraph') {
        const firstText = firstChild.children?.[0];
        if (firstText?.type === 'text') {
          // Match both escaped and non-escaped versions: [!NOTE] or \[!NOTE] or \[!NOTE\]
          const match = firstText.value.match(/^\\?\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\\?\]\s*/i);
          if (match) {
            const type = match[1].toUpperCase();
            
            // Deep clone the children to avoid mutation issues
            const clonedChildren = JSON.parse(JSON.stringify(mdastNode.children));
            const clonedFirstChild = clonedChildren[0];
            const clonedFirstText = clonedFirstChild.children[0];
            
            // Remove the prefix from the cloned text node
            clonedFirstText.value = clonedFirstText.value.replace(/^\\?\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\\?\]\s*/i, '');

            // If the first text node is now empty, remove it from the paragraph
            if (clonedFirstText.value === '') {
              clonedFirstChild.children.shift();
              // Also remove any leading break nodes after the alert prefix
              while (clonedFirstChild.children[0]?.type === 'break') {
                clonedFirstChild.children.shift();
              }
            }

            // If the first paragraph is now empty, remove it
            if (clonedFirstChild.children.length === 0) {
              clonedChildren.shift();
            }

            // Map alert type to callout properties
            let icon = '💡';
            let backgroundColor = 'hsl(var(--muted))';

            switch (type) {
              case 'NOTE':
                icon = 'ℹ️';
                backgroundColor = 'hsla(210, 100%, 50%, 0.1)';
                break;
              case 'TIP':
                icon = '💡';
                backgroundColor = 'hsla(120, 100%, 25%, 0.1)';
                break;
              case 'IMPORTANT':
                icon = '💎';
                backgroundColor = 'hsla(280, 100%, 50%, 0.1)';
                break;
              case 'WARNING':
                icon = '⚠️';
                backgroundColor = 'hsla(45, 100%, 50%, 0.1)';
                break;
              case 'CAUTION':
                icon = '🚨';
                backgroundColor = 'hsla(0, 100%, 50%, 0.1)';
                break;
            }

            return {
              backgroundColor,
              children: convertChildrenDeserialize(clonedChildren, deco, options),
              icon,
              type: 'callout',
            };
          }
        }
      }

      return {
        children: convertChildrenDeserialize(mdastNode.children, deco, options),
        type: getPluginType(options.editor, KEYS.blockquote),
      };
    },
  },
  callout: {
    serialize: (node: any, options: any) => {
      let type = 'NOTE';
      const icon = node.icon;
      if (typeof icon === 'string' && icon.startsWith('lucide:')) {
        const name = icon.replace(/^lucide:/, '');
        if (name === 'info') type = 'NOTE';
        else if (name === 'lightbulb') type = 'TIP';
        else if (name === 'circle-alert') type = 'IMPORTANT';
        else if (name === 'triangle-alert') type = 'WARNING';
        else if (name === 'siren') type = 'CAUTION';
      } else {
        if (icon === '💡') type = 'TIP';
        else if (icon === '💎') type = 'IMPORTANT';
        else if (icon === '⚠️') type = 'WARNING';
        else if (icon === '🚨') type = 'CAUTION';
        else if (icon === 'ℹ️') type = 'NOTE';
      }

      // Convert Plate children to mdast format
      // node.children contains Plate nodes like { type: 'p', children: [{ text: '...' }] }
      // We need to convert to mdast like { type: 'paragraph', children: [{ type: 'text', value: '...' }] }
      const convertPlateToMdast = (plateChildren: any[]): any[] => {
        if (!plateChildren || !Array.isArray(plateChildren)) return [];
        
        return plateChildren.map((child: any) => {
          if (child.type === 'p' || child.type === 'paragraph') {
            // Convert paragraph
            const textContent = child.children?.map((textNode: any) => {
              if (typeof textNode.text === 'string') {
                return { type: 'text', value: textNode.text };
              }
              return { type: 'text', value: '' };
            }) ?? [];
            return { type: 'paragraph', children: textContent };
          }
          // For other types, try to extract text content
          if (child.children) {
            return { type: 'paragraph', children: convertPlateToMdast(child.children) };
          }
          if (typeof child.text === 'string') {
            return { type: 'text', value: child.text };
          }
          return { type: 'text', value: '' };
        });
      };

      // Use options.children if available, otherwise convert node.children
      let mdastChildren = options?.children;
      if (!mdastChildren || mdastChildren.length === 0) {
        mdastChildren = convertPlateToMdast(node.children);
      }
      
      // Deep clone to avoid mutation issues
      const clonedChildren = JSON.parse(JSON.stringify(mdastChildren));
      
      // Add the alert prefix to the first paragraph
      const firstChild = clonedChildren[0];
      if (firstChild && firstChild.type === 'paragraph') {
        const pChildren = firstChild.children ?? [];
        pChildren.unshift({ type: 'text', value: `[!${type}]\n` });
        firstChild.children = pChildren;
      } else {
        clonedChildren.unshift({
          children: [{ type: 'text', value: `[!${type}]\n` }],
          type: 'paragraph',
        });
      }

      return {
        children: clonedChildren,
        type: 'blockquote',
      };
    },
  },
};

const PLACEHOLDER_REGEX = /\{\{([^}]+)\}\}/g;

type PlaceholderParseResult = {
  placeholderType: 'page' | 'totalPages' | 'date' | 'title' | 'variable';
  format?: string;
  variableName?: string;
};

export function parsePlaceholderToken(token: string): PlaceholderParseResult | null {
  const trimmed = token.trim();
  if (!trimmed) return null;

  if (trimmed === 'page') {
    return { placeholderType: 'page' };
  }
  if (trimmed.startsWith('page:')) {
    return { placeholderType: 'page', format: trimmed.split(':').slice(1).join(':').trim() || undefined };
  }
  if (trimmed === 'totalPages') {
    return { placeholderType: 'totalPages' };
  }
  if (trimmed.startsWith('totalPages:')) {
    return { placeholderType: 'totalPages', format: trimmed.split(':').slice(1).join(':').trim() || undefined };
  }
  if (trimmed === 'date') {
    return { placeholderType: 'date' };
  }
  if (trimmed.startsWith('date:')) {
    return { placeholderType: 'date', format: trimmed.split(':').slice(1).join(':').trim() || undefined };
  }
  if (trimmed === 'title') {
    return { placeholderType: 'title' };
  }
  if (trimmed.startsWith('var:') || trimmed.startsWith('variable:')) {
    const parts = trimmed.split(':');
    const variableName = parts.slice(1).join(':').trim();
    if (!variableName) return null;
    return { placeholderType: 'variable', variableName };
  }

  return null;
}

function serializePlaceholderToken(node: any): string {
  const placeholderType = node.placeholderType as string | undefined;
  const format = typeof node.format === 'string' ? node.format.trim() : '';
  const variableName = typeof node.variableName === 'string' ? node.variableName.trim() : '';

  if (placeholderType === 'page') {
    const token = format && format !== 'decimal' ? `page:${format}` : 'page';
    return `{{${token}}}`;
  }
  if (placeholderType === 'totalPages') {
    const token = format && format !== 'decimal' ? `totalPages:${format}` : 'totalPages';
    return `{{${token}}}`;
  }
  if (placeholderType === 'date') {
    const token = format && format !== 'default' ? `date:${format}` : 'date';
    return `{{${token}}}`;
  }
  if (placeholderType === 'title') {
    return '{{title}}';
  }
  if (placeholderType === 'variable') {
    const token = variableName ? `var:${variableName}` : 'var';
    return `{{${token}}}`;
  }

  return '{{placeholder}}';
}

function splitTextWithPlaceholders(value: string): any[] {
  const nodes: any[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  PLACEHOLDER_REGEX.lastIndex = 0;
  while ((match = PLACEHOLDER_REGEX.exec(value)) !== null) {
    const start = match.index;
    const end = start + match[0].length;
    const rawToken = match[1];

    if (start > lastIndex) {
      nodes.push({ type: 'text', value: value.slice(lastIndex, start) });
    }

    const parsed = parsePlaceholderToken(rawToken);
    if (parsed) {
      nodes.push({ type: 'placeholder', ...parsed });
    } else {
      nodes.push({ type: 'text', value: match[0] });
    }

    lastIndex = end;
  }

  if (lastIndex < value.length) {
    nodes.push({ type: 'text', value: value.slice(lastIndex) });
  }

  return nodes;
}

function transformPlaceholdersInTree(node: any): any {
  if (!node || typeof node !== 'object') return node;

  if (node.type === 'code' || node.type === 'inlineCode' || node.type === 'html') {
    return node;
  }

  if (node.type === 'text' && typeof node.value === 'string') {
    const parts = splitTextWithPlaceholders(node.value);
    if (parts.length === 1) {
      return node;
    }
    return parts;
  }

  if (Array.isArray(node.children)) {
    const nextChildren: any[] = [];
    node.children.forEach((child: any) => {
      const transformed = transformPlaceholdersInTree(child);
      if (Array.isArray(transformed)) {
        nextChildren.push(...transformed);
      } else {
        nextChildren.push(transformed);
      }
    });
    node.children = nextChildren;
  }

  return node;
}

function remarkPlaceholders() {
  return (tree: any) => {
    transformPlaceholdersInTree(tree);
  };
}

const placeholderRules = {
  placeholder: {
    deserialize: (mdastNode: any, _deco: any, options: any) => ({
      type: getPluginType(options.editor, KEY_PLACEHOLDER),
      placeholderType: mdastNode.placeholderType,
      format: mdastNode.format,
      variableName: mdastNode.variableName,
      children: [{ text: '' }],
    }),
    serialize: (node: any) => ({
      type: 'text',
      value: serializePlaceholderToken(node),
    }),
  },
};

export const MarkdownKit = [
  MarkdownPlugin.configure({
    options: {
      plainMarks: [KEYS.suggestion, KEYS.comment],
      remarkPlugins: [remarkMath, remarkGfm, remarkMention, remarkPlaceholders],
      rules: { ...mathRules, ...imageRules, ...pageBreakRules, ...alertRules, ...placeholderRules } as any,
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

  // First, fix escaped alert syntax in blockquotes
  // remark-stringify escapes [ to \[ which breaks GitHub-style alerts
  // Convert \[!NOTE] back to [!NOTE] (and other alert types)
  let result = markdown.replace(
    /^(>\s*)\\?\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\\?\]/gim,
    '$1[!$2]'
  );

  // Convert multi-line block math to single-line format
  // Match: $$ newline content newline $$
  return result.replace(
    /\$\$\n([\s\S]*?)\n\$\$/g,
    (match, content) => {
      const trimmed = content.trim();
      // Keep multi-line if content has multiple lines
      if (trimmed.includes('\n')) return match;
      return `$$${trimmed}$$`;
    }
  );
}
