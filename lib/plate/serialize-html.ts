import type { Descendant, TElement, TText } from 'platejs';

interface SerializeContext {
  pageNumber?: string | number;
  date?: string;
  title?: string;
}

// Helper to post-process HTML string and convert img with figcaption attribute to figure element
export function processHtmlImageCaptions(html: string): string {
  // Match img tags that have a figcaption attribute
  // <img ... figcaption="value" ... >
  return html.replace(
    /<img([^>]*?)\s+figcaption="([^"]*)"([^>]*?)>/g,
    (match, before, caption, after) => {
      // Extract width if present to constrain the figure
      const styleMatch = (before + after).match(/style="([^"]*)"/);
      let width = '';
      let isCentered = false;
      
      if (styleMatch) {
        const styles = styleMatch[1];
        const widthMatch = styles.match(/width:\s*(\d+)px/);
        if (widthMatch) {
          width = widthMatch[1];
        }
        
        if (styles.includes('margin-left: auto') && styles.includes('margin-right: auto')) {
          isCentered = true;
        }
      }
      
      // Also check explicit width attribute
      if (!width) {
        const widthAttr = (before + after).match(/width="(\d+)"/);
        if (widthAttr) {
          width = widthAttr[1];
        }
      }
      
      let figureStyle = 'display: block; margin-top: 1em; margin-bottom: 1em;';
      if (width) {
        figureStyle += ` width: ${width}px;`;
      }
      if (isCentered) {
        figureStyle += ' margin-left: auto; margin-right: auto;';
      }
      
      // We need to decode the caption if it was HTML attribute encoded
      const decodedCaption = caption
        .replace(/&quot;/g, '"')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>');

      return `<figure style="${figureStyle}">
        <img${before}${after}>
        <figcaption style="text-align: center; margin-top: 0.5em; color: #666; font-size: 0.9em; line-height: 1.4;">${decodedCaption}</figcaption>
      </figure>`;
    }
  );
}

// Serialize Plate nodes to HTML with alignment and formatting preserved
export function serializeNodesToHtml(nodes: Descendant[], context: SerializeContext = {}): string {
  return nodes.map(node => serializeNode(node, context)).join('');
}

function serializeNode(node: Descendant, context: SerializeContext): string {
  // Text node
  if ('text' in node) {
    return serializeTextNode(node as TText, context);
  }
  
  // Element node
  const element = node as TElement;
  const children = (element.children || []).map(c => serializeNode(c, context)).join('');
  
  return serializeElementNode(element, children, context);
}

function serializeTextNode(node: TText, context: SerializeContext): string {
  let text = escapeHtml(node.text || '');
  
  // Build inline styles for font properties
  const styles: string[] = [];
  if (node.fontSize) {
    styles.push(`font-size: ${node.fontSize}`);
  }
  if (node.fontFamily) {
    styles.push(`font-family: ${node.fontFamily}`);
  }
  if (node.color) {
    styles.push(`color: ${node.color}`);
  }
  if (node.backgroundColor) {
    styles.push(`background-color: ${node.backgroundColor}`);
  }
  
  // Wrap with span if we have styles
  if (styles.length > 0) {
    text = `<span style="${styles.join('; ')}">${text}</span>`;
  }
  
  // Apply marks
  if (node.bold) {
    text = `<strong>${text}</strong>`;
  }
  if (node.italic) {
    text = `<em>${text}</em>`;
  }
  if (node.underline) {
    text = `<u>${text}</u>`;
  }
  if (node.strikethrough) {
    text = `<s>${text}</s>`;
  }
  if (node.code) {
    text = `<code>${text}</code>`;
  }
  if (node.superscript) {
    text = `<sup>${text}</sup>`;
  }
  if (node.subscript) {
    text = `<sub>${text}</sub>`;
  }
  
  return text;
}

function serializeElementNode(element: TElement, children: string, context: SerializeContext): string {
  const align = element.align as string | undefined;
  const style = align ? ` style="text-align: ${align}"` : '';
  
  switch (element.type) {
    case 'h1':
      return `<h1${style}>${children}</h1>`;
    case 'h2':
      return `<h2${style}>${children}</h2>`;
    case 'h3':
      return `<h3${style}>${children}</h3>`;
    case 'h4':
      return `<h4${style}>${children}</h4>`;
    case 'h5':
      return `<h5${style}>${children}</h5>`;
    case 'h6':
      return `<h6${style}>${children}</h6>`;
    case 'p':
      return `<p${style}>${children}</p>`;
    case 'blockquote':
      return `<blockquote${style}>${children}</blockquote>`;
    case 'code_block':
      return `<pre><code>${children}</code></pre>`;
    case 'ul':
      return `<ul>${children}</ul>`;
    case 'ol':
      return `<ol>${children}</ol>`;
    case 'li':
      // Check for nested list item content
      const licContent = element.children?.find((c: Descendant) => (c as TElement).type === 'lic');
      if (licContent) {
        const licChildren = ((licContent as TElement).children || []).map(c => serializeNode(c, context)).join('');
        // Check for nested lists
        const nestedList = element.children?.find((c: Descendant) => 
          (c as TElement).type === 'ul' || (c as TElement).type === 'ol'
        );
        const nestedHtml = nestedList ? serializeNode(nestedList, context) : '';
        return `<li${style}>${licChildren}${nestedHtml}</li>`;
      }
      return `<li${style}>${children}</li>`;
    case 'lic':
      // List item content is handled by li
      return children;
    case 'a':
    case 'link':
      const href = element.url as string || '#';
      return `<a href="${escapeHtml(href)}">${children}</a>`;
    case 'hr':
      return '<hr>';
    case 'placeholder':
      const pType = element.placeholderType as string;
      const pFormat = element.format as string;
      const pOffset = (element.offset as number) || 0;
      const pFontFamily = element.fontFamily as string;
      const pFontSize = element.fontSize as string;
      
      const pStyles: string[] = [];
      if (pFontFamily) pStyles.push(`font-family: ${pFontFamily}`);
      if (pFontSize) pStyles.push(`font-size: ${pFontSize}`);
      const styleAttr = pStyles.length > 0 ? ` style="${pStyles.join('; ')}"` : '';

      if (pType === 'page') {
        // For PDF, we use CSS counters. Puppeteer supports this.
        // The list-style-type can be used to control the numbering format.
        const counterStyle = pFormat || 'decimal';
        return `<span class="page-number-placeholder"${styleAttr} data-format="${counterStyle}" data-offset="${pOffset}"></span>`;
      }
      if (pType === 'date') {
        const date = new Date();
        let formattedDate = date.toLocaleDateString();
        if (pFormat === 'iso') formattedDate = date.toISOString().split('T')[0];
        if (pFormat === 'long') formattedDate = date.toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' });
        if (pFormat === 'short') formattedDate = date.toLocaleDateString(undefined, { month: 'numeric', day: 'numeric', year: '2-digit' });
        return `<span class="current-date"${styleAttr}>${formattedDate}</span>`;
      }
      if (pType === 'title') {
        const title = context.title || 'Untitled';
        return `<span class="file-title"${styleAttr}>${title}</span>`;
      }
      return '';
    // Table elements
    case 'table':
      const tableBorderNone = element.borderNone as boolean | undefined;
      const tableBorders = element.borders as any;
      let tableStyle = 'border-collapse: collapse; width: 100%;';
      
      if (tableBorderNone || (tableBorders && tableBorders.size === 0)) {
        tableStyle += ' border: none;';
      }
      return `<table style="${tableStyle}">${children}</table>`;
    case 'tr':
      return `<tr>${children}</tr>`;
    case 'th':
    case 'td':
      const isTh = element.type === 'th';
      const background = element.background as string | undefined;
      const cellStyles: string[] = ['padding: 8px'];
      
      if (isTh) {
        cellStyles.push('text-align: left');
        if (background) cellStyles.push(`background-color: ${background}`);
        else cellStyles.push('background-color: #f4f4f4');
      } else {
        if (background) cellStyles.push(`background-color: ${background}`);
        if (align) cellStyles.push(`text-align: ${align}`);
      }
      
      // Handle borders using Plate's borders property
      const borders = element.borders as any;
      
      if (borders) {
        const sides = ['top', 'right', 'bottom', 'left'];
        // Check if any border side is explicitly set to 0 (indicating "no borders" mode)
        const hasExplicitNoBorder = sides.some(side => borders[side] && borders[side].size === 0);
        
        sides.forEach(side => {
          const borderSide = borders[side];
          if (borderSide) {
            if (borderSide.size > 0) {
              cellStyles.push(`border-${side}: ${borderSide.size}px solid ${borderSide.color || '#ddd'}`);
            } else {
              cellStyles.push(`border-${side}: none`);
            }
          } else if (hasExplicitNoBorder) {
            // If any side is explicitly set to 0, treat undefined sides as no border too
            cellStyles.push(`border-${side}: none`);
          } else {
            // Default border for side if not specified and no explicit "no border" is set
            cellStyles.push(`border-${side}: 1px solid #ddd`);
          }
        });
      } else if (element.borderNone) {
        cellStyles.push('border: none');
      } else {
        // Default border if no borders object and no borderNone
        cellStyles.push('border: 1px solid #ddd');
      }
      
      const tag = isTh ? 'th' : 'td';
      return `<${tag} style="${cellStyles.join('; ')}">${children}</${tag}>`;
    // Image
    case 'img':
    case 'image':
      const imgUrl = element.url as string || '';
      const imgAlt = element.alt as string || '';
      const imgId = element.id as string || '';
      const imgWidth = element.width as number | undefined;
      const imgStyles: string[] = ['max-width: 100%', 'height: auto', 'display: block'];
      if (imgWidth) imgStyles.push(`width: ${imgWidth}px`);
      
      // Apply alignment via margin (more reliable for PDF than text-align)
      let isCentered = false;
      if (align === 'center') {
        imgStyles.push('margin-left: auto', 'margin-right: auto');
        isCentered = true;
      } else if (align === 'right') {
        imgStyles.push('margin-left: auto', 'margin-right: 0');
      } else {
        // left or default
        imgStyles.push('margin-left: 0', 'margin-right: auto');
      }
      
      const idAttr = imgId ? ` id="${escapeHtml(imgId)}"` : '';
      const imgTag = `<img src="${escapeHtml(imgUrl)}" alt="${escapeHtml(imgAlt)}"${idAttr} style="${imgStyles.join('; ')}" />`;
      
      // Handle caption if present in node (as children or property)
      let captionText = '';
      if (element.caption && Array.isArray(element.caption)) {
        captionText = element.caption.map(c => c.text || '').join('');
      }
      
      if (captionText) {
        let figureStyle = 'display: block; margin-top: 1em; margin-bottom: 1em;';
        if (imgWidth) {
          figureStyle += ` width: ${imgWidth}px;`;
        }
        if (isCentered) {
          figureStyle += ' margin-left: auto; margin-right: auto;';
        }
        
        return `<figure style="${figureStyle}">
          ${imgTag}
          <figcaption style="text-align: center; margin-top: 0.5em; color: #666; font-size: 0.9em; line-height: 1.4;">${escapeHtml(captionText)}</figcaption>
        </figure>`;
      }
      
      return imgTag;
    case 'media_embed':
      const embedUrl = element.url as string || '';
      const embedHtml = `<iframe src="${escapeHtml(embedUrl)}" style="width: 100%; aspect-ratio: 16/9; border: none;"></iframe>`;
      if (align) {
        return `<div style="text-align: ${align}">${embedHtml}</div>`;
      }
      return embedHtml;
    default:
      // Default to paragraph for unknown types
      if (children) {
        return `<p${style}>${children}</p>`;
      }
      return '';
  }
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// Parse HTML back to a simple markdown-like format for storage
// This is a best-effort conversion that preserves alignment via HTML
export function parseHtmlToNodes(html: string): Descendant[] {
  // For now, we'll store as HTML directly and just wrap in a basic structure
  // The editor will deserialize this properly
  if (!html) {
    return [{ type: 'p', children: [{ text: '' }] }];
  }
  
  // If it looks like HTML, return a simple paragraph with the raw content
  // The proper deserialization happens via markdown
  return [{ type: 'p', children: [{ text: html }] }];
}
