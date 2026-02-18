import { MarkdownPlugin, convertChildrenDeserialize, convertNodesSerialize, remarkMention } from '@platejs/markdown';
import { KEYS, NodeApi, getPluginType } from 'platejs';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import { ELEMENT_PAGE_BREAK } from './page-break-plugin';
import { KEY_PLACEHOLDER } from './placeholder-kit';
import {
  ELEMENT_HTML_TABLE,
  ELEMENT_HTML_TABLE_ROW,
  ELEMENT_HTML_TABLE_CELL,
  ELEMENT_HTML_TABLE_HEADER_CELL,
} from './html-table-plugin';

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
 * Parse inline DOM content into Plate text nodes, preserving bold/italic/code marks.
 */
function parseInlineContent(node: Node): any[] {
  const results: any[] = [];

  for (const child of Array.from(node.childNodes)) {
    if (child.nodeType === Node.TEXT_NODE) {
      const text = child.textContent || '';
      if (text) results.push({ text });
    } else if (child.nodeType === Node.ELEMENT_NODE) {
      const el = child as Element;
      const tag = el.tagName.toLowerCase();

      if (tag === 'strong' || tag === 'b') {
        const inner = parseInlineContent(el);
        inner.forEach((n: any) => { n.bold = true; });
        results.push(...inner);
      } else if (tag === 'em' || tag === 'i') {
        const inner = parseInlineContent(el);
        inner.forEach((n: any) => { n.italic = true; });
        results.push(...inner);
      } else if (tag === 'code') {
        results.push({ text: el.textContent || '', code: true });
      } else if (tag === 'br') {
        results.push({ text: '\n' });
      } else {
        results.push(...parseInlineContent(el));
      }
    }
  }

  return results.length > 0 ? results : [{ text: '' }];
}

const BLOCK_TAGS = new Set(['p', 'div', 'ul', 'ol', 'br', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6']);

/**
 * Parse the children of a <td>/<th> cell into Plate block nodes.
 * Handles <br>, <p>, <div>, <ul>, <ol> for rich cell content.
 */
function parseCellChildren(cell: Element): any[] {
  const hasBlockContent = Array.from(cell.childNodes).some(
    (n) => n.nodeType === Node.ELEMENT_NODE && BLOCK_TAGS.has((n as Element).tagName.toLowerCase())
  );

  if (!hasBlockContent) {
    return [{ type: 'p', children: parseInlineContent(cell) }];
  }

  const blocks: any[] = [];
  let pendingInline: any[] = [];

  function flushInline() {
    if (pendingInline.length === 0) return;
    const hasContent = pendingInline.some((n: any) => typeof n.text === 'string' && n.text.trim());
    if (hasContent) {
      blocks.push({ type: 'p', children: pendingInline });
    }
    pendingInline = [];
  }

  for (const node of Array.from(cell.childNodes)) {
    if (node.nodeType === Node.TEXT_NODE) {
      const text = node.textContent || '';
      if (text.trim()) pendingInline.push({ text });
    } else if (node.nodeType === Node.ELEMENT_NODE) {
      const el = node as Element;
      const tag = el.tagName.toLowerCase();

      if (tag === 'br') {
        flushInline();
      } else if (tag === 'p' || tag === 'div') {
        flushInline();
        blocks.push({ type: 'p', children: parseInlineContent(el) });
      } else if (tag === 'ul' || tag === 'ol') {
        flushInline();
        const listStyleType = tag === 'ol' ? 'decimal' : 'disc';
        for (const li of Array.from(el.children)) {
          if (li.tagName.toLowerCase() === 'li') {
            blocks.push({
              type: 'p',
              indent: 1,
              listStyleType,
              children: parseInlineContent(li),
            });
          }
        }
      } else {
        pendingInline.push(...parseInlineContent(el));
      }
    }
  }

  flushInline();

  return blocks.length > 0 ? blocks : [{ type: 'p', children: [{ text: '' }] }];
}

/**
 * Parse an HTML table string into structured Plate nodes.
 * Uses DOMParser to handle complex HTML (colspan, rowspan, nested tags).
 */
function parseHtmlTableToNodes(html: string): any | null {
  if (typeof DOMParser === 'undefined') return null;

  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');
  const table = doc.querySelector('table');
  if (!table) return null;

  const rows: any[] = [];

  function processRow(tr: Element) {
    const cells: any[] = [];

    for (const child of Array.from(tr.children)) {
      const tag = child.tagName.toLowerCase();
      if (tag !== 'th' && tag !== 'td') continue;

      const isHeader = tag === 'th';
      const colspan = child.getAttribute('colspan');
      const rowspan = child.getAttribute('rowspan');

      const cellNode: any = {
        type: isHeader ? ELEMENT_HTML_TABLE_HEADER_CELL : ELEMENT_HTML_TABLE_CELL,
        children: parseCellChildren(child),
      };

      if (colspan && parseInt(colspan) > 1) cellNode.colSpan = parseInt(colspan);
      if (rowspan && parseInt(rowspan) > 1) cellNode.rowSpan = parseInt(rowspan);

      const style = (child as HTMLElement).getAttribute('style') || '';
      const bgMatch = style.match(/background-color:\s*([^;]+)/i);
      if (bgMatch) cellNode.background = bgMatch[1].trim();

      const vaMatch = style.match(/vertical-align:\s*(top|middle|bottom)/i);
      if (vaMatch) cellNode.verticalAlign = vaMatch[1];

      const taMatch = style.match(/text-align:\s*(left|center|right)/i);
      if (taMatch) cellNode.align = taMatch[1];

      const alignAttr = child.getAttribute('align');
      if (alignAttr && !taMatch) cellNode.align = alignAttr;

      cells.push(cellNode);
    }

    if (cells.length > 0) {
      rows.push({
        type: ELEMENT_HTML_TABLE_ROW,
        children: cells,
      });
    }
  }

  // Process rows in order: thead, tbody, tfoot, and direct tr children
  for (const child of Array.from(table.children)) {
    const tag = child.tagName.toLowerCase();
    if (tag === 'thead' || tag === 'tbody' || tag === 'tfoot') {
      for (const tr of Array.from(child.children)) {
        if (tr.tagName.toLowerCase() === 'tr') processRow(tr);
      }
    } else if (tag === 'tr') {
      processRow(child);
    }
  }

  if (rows.length === 0) return null;

  const tableNode: any = {
    type: ELEMENT_HTML_TABLE,
    children: rows,
  };

  const colgroup = table.querySelector('colgroup');
  if (colgroup) {
    const colWidths: number[] = [];
    for (const col of Array.from(colgroup.querySelectorAll('col'))) {
      const el = col as HTMLElement;
      const style = el.getAttribute('style') || '';
      const styleMatch = style.match(/width:\s*([\d.]+)%/i);
      const attrWidth = el.getAttribute('width');
      const pct = styleMatch
        ? parseFloat(styleMatch[1])
        : attrWidth != null
          ? parseFloat(String(attrWidth).replace(/%\s*$/, ''))
          : NaN;
      if (!Number.isNaN(pct) && pct > 0) colWidths.push(pct);
      else colWidths.push(0);
    }
    if (colWidths.length > 0) {
      const total = colWidths.reduce((a, b) => a + b, 0);
      if (total > 0) {
        tableNode.colWidths = colWidths.map((w) => (w / total) * 100);
      }
    }
  }

  return tableNode;
}

function extractNodeText(children: any[]): string {
  if (!children || !Array.isArray(children)) return '';

  return children
    .map((child: any) => {
      if (typeof child.text === 'string') return child.text;
      if (child.children) return extractNodeText(child.children);
      return '';
    })
    .join('');
}

/**
 * Serialize the block children of a cell into an HTML string.
 * Handles multiple paragraphs (joined with <br>) and list items (<ul>/<ol>).
 */
function serializeCellContent(children: any[]): string {
  if (!children || !Array.isArray(children)) return '';

  const parts: string[] = [];
  let currentListTag: string | null = null;
  let listItems: string[] = [];

  function flushList() {
    if (listItems.length === 0) return;
    parts.push(`<${currentListTag}>${listItems.map((li) => `<li>${li}</li>`).join('')}</${currentListTag}>`);
    listItems = [];
    currentListTag = null;
  }

  for (const child of children) {
    if (child.listStyleType) {
      const tag = child.listStyleType === 'decimal' ? 'ol' : 'ul';
      if (currentListTag && currentListTag !== tag) flushList();
      currentListTag = tag;
      listItems.push(extractNodeText(child.children || []));
    } else {
      flushList();
      parts.push(extractNodeText(child.children || []));
    }
  }

  flushList();

  // Replace \\n with <br> so we never output raw newlines (which can become &#xA; when encoded)
  const ensureBrNotNewline = (s: string) => s.replace(/\n/g, '<br>');
  if (parts.length <= 1 && !parts[0]?.startsWith('<')) return ensureBrNotNewline(parts[0] || '');
  return parts.map(ensureBrNotNewline).join('<br>');
}

function serializeHtmlTableToString(node: any): string {
  let html = '<table>\n';
  const colWidths = node.colWidths;
  if (Array.isArray(colWidths) && colWidths.length > 0) {
    html += '  <colgroup>\n';
    for (const pct of colWidths) {
      const w = Math.round(Number(pct) * 10) / 10;
      html += `    <col style="width: ${w}%" />\n`;
    }
    html += '  </colgroup>\n';
  }
  let hasHeaders = false;
  let headersDone = false;

  for (const row of node.children || []) {
    if (row.type !== ELEMENT_HTML_TABLE_ROW) continue;

    const isHeaderRow =
      row.children?.length > 0 &&
      row.children.every((c: any) => c.type === ELEMENT_HTML_TABLE_HEADER_CELL);

    if (isHeaderRow && !headersDone) {
      if (!hasHeaders) {
        html += '  <thead>\n';
        hasHeaders = true;
      }
    } else if (hasHeaders && !headersDone) {
      html += '  </thead>\n  <tbody>\n';
      headersDone = true;
    } else if (!hasHeaders && !headersDone) {
      html += '  <tbody>\n';
      headersDone = true;
    }

    html += '    <tr>\n';
    for (const cell of row.children || []) {
      const tag = cell.type === ELEMENT_HTML_TABLE_HEADER_CELL ? 'th' : 'td';
      const attrs: string[] = [];
      if (cell.colSpan && cell.colSpan > 1) attrs.push(`colspan="${cell.colSpan}"`);
      if (cell.rowSpan && cell.rowSpan > 1) attrs.push(`rowspan="${cell.rowSpan}"`);

      const styles: string[] = [];
      if (cell.background) styles.push(`background-color: ${cell.background}`);
      if (cell.verticalAlign && cell.verticalAlign !== 'top') styles.push(`vertical-align: ${cell.verticalAlign}`);
      if (cell.align && cell.align !== 'left') styles.push(`text-align: ${cell.align}`);
      if (styles.length > 0) attrs.push(`style="${styles.join('; ')}"`);

      const attrStr = attrs.length > 0 ? ' ' + attrs.join(' ') : '';
      const content = serializeCellContent(cell.children);
      html += `      <${tag}${attrStr}>${content}</${tag}>\n`;
    }
    html += '    </tr>\n';
  }

  if (hasHeaders && !headersDone) {
    html += '  </thead>\n';
  } else if (headersDone) {
    html += '  </tbody>\n';
  }

  html += '</table>';
  return html;
}

/**
 * Recursively replace mdast "break" nodes with "html" nodes (value: "<br>")
 * so line breaks in table cells serialize as <br> in source mode.
 */
function replaceBreaksWithBr(nodes: any[]): any[] {
  return nodes.map((node) => {
    if (node.type === 'break') {
      return { type: 'html', value: '<br>' };
    }
    if (node.children) {
      return { ...node, children: replaceBreaksWithBr(node.children) };
    }
    return node;
  });
}

/**
 * Expand text nodes containing \\n into [text, html<br>, text, ...] so mdast-util-to-markdown
 * outputs <br> instead of encoding \\n as &#xA; (which happens in table cell context).
 */
function expandNewlinesInTextNodes(nodes: any[]): any[] {
  const result: any[] = [];
  for (const node of nodes) {
    if (node.type === 'text' && typeof node.value === 'string' && node.value.includes('\n')) {
      const parts = node.value.split('\n');
      for (let i = 0; i < parts.length; i++) {
        if (i > 0) result.push({ type: 'html', value: '<br>' });
        if (parts[i]) result.push({ type: 'text', value: parts[i] });
      }
    } else if (node.children) {
      result.push({ ...node, children: expandNewlinesInTextNodes(node.children) });
    } else {
      result.push(node);
    }
  }
  return result;
}

/**
 * Custom td/th serialize: ensure line breaks (Enter or Shift+Enter) become <br> in source.
 * - Multiple blocks: join with <br/> (default behavior)
 * - Break nodes inside paragraphs: replace with <br> (mdast would otherwise use space in tables)
 */
const tableCellRules = {
  td: {
    serialize: (node: any, options: any) => {
      const children = convertNodesSerialize(node.children, options);
      let result: any[];
      if (children.length > 1) {
        result = [];
        for (let i = 0; i < children.length; i++) {
          result.push(children[i]);
          if (i < children.length - 1) result.push({ type: 'html', value: '<br>' });
        }
      } else {
        result = children;
      }
      return { type: 'tableCell', children: expandNewlinesInTextNodes(replaceBreaksWithBr(result)) };
    },
  },
  th: {
    serialize: (node: any, options: any) => {
      const children = convertNodesSerialize(node.children, options);
      let result: any[];
      if (children.length > 1) {
        result = [];
        for (let i = 0; i < children.length; i++) {
          result.push(children[i]);
          if (i < children.length - 1) result.push({ type: 'html', value: '<br>' });
        }
      } else {
        result = children;
      }
      return { type: 'tableCell', children: expandNewlinesInTextNodes(replaceBreaksWithBr(result)) };
    },
  },
};

const htmlTableRules = {
  [ELEMENT_HTML_TABLE]: {
    serialize: (node: any) => ({
      type: 'html',
      value: serializeHtmlTableToString(node),
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

      // Handle HTML tables
      if (value && /<table[\s>]/i.test(value) && /<\/table>/i.test(value)) {
        const tableNode = parseHtmlTableToNodes(value);
        if (tableNode) return tableNode;
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

      // Convert <br>, <br/>, <br /> to newline so line breaks in table cells render correctly
      const brValue = (value || '').replace(/^\s+|\s+$/g, '');
      if (/^<br\s*\/?>\s*$/i.test(brValue)) {
        return { text: '\n' };
      }

      // Decode &#xA; and &#10; (newline entities) to actual newline for proper display
      const decoded = (value || '')
        .replace(/&#x0?0?A;/gi, '\n')
        .replace(/&#10;/g, '\n');
      if (decoded !== value) return { text: decoded };

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
      rules: { ...mathRules, ...imageRules, ...pageBreakRules, ...tableCellRules, ...htmlTableRules, ...alertRules, ...placeholderRules } as any,
    },
  }),
];

/**
 * Preprocess HTML tables in markdown to ensure they are treated as a single
 * HTML block by remark. Removes blank lines between <table> and </table> tags
 * so remark doesn't split the table into multiple nodes.
 */
export function preprocessHtmlTables(markdown: string): string {
  if (!markdown || !markdown.includes('<table')) return markdown;

  const lines = markdown.split('\n');
  const result: string[] = [];
  let inTable = false;
  let tableDepth = 0;

  for (const line of lines) {
    const openCount = (line.match(/<table[\s>]/gi) || []).length;
    const closeCount = (line.match(/<\/table>/gi) || []).length;

    if (openCount > 0 && !inTable) {
      inTable = true;
      tableDepth = openCount - closeCount;
    } else if (inTable) {
      tableDepth += openCount - closeCount;
      if (tableDepth <= 0) {
        inTable = false;
        tableDepth = 0;
      }
    }

    if (inTable && line.trim() === '') {
      continue;
    }

    result.push(line);
  }

  return result.join('\n');
}

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
