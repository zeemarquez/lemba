import type { Descendant, TElement, TText } from 'platejs';
import { fixTypstUnit } from './client-compiler';

interface SerializeContext {
    title?: string;
    scaleImages?: boolean;
    /** If true, content is for header/footer which is already wrapped in context expression */
    insideContext?: boolean;
}

export function serializeNodesToTypst(nodes: Descendant[], context: SerializeContext = {}): string {
    return nodes.map(node => serializeNode(node, context)).join('\n');
}

function escapeTypst(text: string): string {
    if (!text) return '';
    return text
        .replace(/\\/g, '\\\\')
        .replace(/\*/g, '\\*')
        .replace(/_/g, '\\_')
        .replace(/`/g, '\\`')
        .replace(/\$/g, '\\$')
        .replace(/#/g, '\\#')
        .replace(/\[/g, '\\[')
        .replace(/\]/g, '\\]')
        .replace(/@/g, '\\@')
        .replace(/=/g, '\\=');
}

/**
 * Escapes a string to be used as a Typst string literal "..."
 */
function escapeTypstString(text: string): string {
    if (!text) return '';
    return text.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

/**
 * Scales a dimension value by a factor (for header/footer image sizing)
 * Supports: 100, 100px, 100pt, 100%, 100mm, 100cm, 100em
 */
function scaleTypstUnit(value: string | number | undefined, factor: number): string {
    if (value === undefined || value === null || value === '') return '';
    const s = String(value).trim();
    
    // Match number with optional unit
    const match = s.match(/^(-?\d+(?:\.\d+)?)(px|pt|%|mm|cm|em|in)?$/i);
    if (match) {
        const num = parseFloat(match[1]);
        const unit = match[2] || 'pt';
        const scaled = num * factor;
        // Convert px to pt
        const finalUnit = unit.toLowerCase() === 'px' ? 'pt' : unit;
        return `${scaled}${finalUnit}`;
    }
    
    // If no match, return as-is through fixTypstUnit
    return fixTypstUnit(value);
}

function serializeNode(node: Descendant, context: SerializeContext): string {
    if ('text' in node) {
        return serializeTextNode(node as TText);
    } else {
        return serializeElementNode(node as TElement, context);
    }
}

function serializeTextNode(node: TText): string {
    let text = escapeTypst(node.text || '');

    if (node.bold) text = `*${text}*`;
    if (node.italic) text = `_${text}_`;
    if (node.code) text = `\`${text}\``;
    if (node.underline) text = `#underline[${text}]`;
    if (node.strikethrough) text = `#strike[${text}]`;
    if (node.subscript) text = `#sub[${text}]`;
    if (node.superscript) text = `#super[${text}]`;

    const styles: string[] = [];
    if ((node as any).color) styles.push(`fill: rgb("${(node as any).color}")`);
    if ((node as any).fontSize) styles.push(`size: ${fixTypstUnit((node as any).fontSize)}`);
    if ((node as any).fontFamily) styles.push(`font: "${(node as any).fontFamily}"`);

    if (styles.length > 0) {
        return `#text(${styles.join(', ')})[${text}]`;
    }

    return text;
}

function serializeElementNode(element: TElement, context: SerializeContext): string {
    const children = element.children?.map(c => serializeNode(c, context)).join('') || '';

    const wrapAlign = (content: string, align?: string) => {
        if (align === 'center') return `#align(center)[${content}]`;
        if (align === 'right') return `#align(right)[${content}]`;
        if (align === 'justify') return `#align(justify)[${content}]`;
        return content;
    };

    const align = element.align as string | undefined;

    switch (element.type) {
        case 'p':
            return wrapAlign(`${children}\n`, align);

        case 'h1': return wrapAlign(`= ${children}\n`, align);
        case 'h2': return wrapAlign(`== ${children}\n`, align);
        case 'h3': return wrapAlign(`=== ${children}\n`, align);
        case 'h4': return wrapAlign(`==== ${children}\n`, align);
        case 'h5': return wrapAlign(`===== ${children}\n`, align);
        case 'h6': return wrapAlign(`====== ${children}\n`, align);

        case 'blockquote':
            return `#quote(block: true)[${children}]\n`;

        case 'code_block':
            return `\`\`\`\n${element.children.map((c: any) => c.text).join('')}\n\`\`\`\n`;

        case 'ul':
        case 'ol':
            return children;
        case 'li':
            return `- ${children}\n`;

        case 'link':
        case 'a':
            const linkUrl = (element as any).url || (element as any).href || '';
            return `#link("${escapeTypstString(linkUrl)}")[${children}]`;

        case 'img':
        case 'image':
            const e = element as any;
            const src = e.url || e.src || '';

            // Collect sizing arguments
            // Apply 0.25 scaling factor for header/footer images (when scaleImages is true)
            const imgScaleFactor = context.scaleImages ? 0.25 : 1;
            const args: string[] = [];

            // Priority: width, then maxWidth/maxWidth
            if (e.width) {
                args.push(`width: ${scaleTypstUnit(e.width, imgScaleFactor)}`);
            } else if (e.style?.width) {
                args.push(`width: ${scaleTypstUnit(e.style.width, imgScaleFactor)}`);
            }

            if (e.height) {
                args.push(`height: ${scaleTypstUnit(e.height, imgScaleFactor)}`);
            } else if (e.style?.height) {
                args.push(`height: ${scaleTypstUnit(e.style.height, imgScaleFactor)}`);
            }

            const imgArgs = args.length > 0 ? `, ${args.join(', ')}` : '';
            const imgCall = `image("${escapeTypstString(src)}"${imgArgs})`;

            if (e.caption) {
                return `#figure(${imgCall}, caption: [${children}])`;
            }

            // If it's a block level image (default in markdown usually), we can use the # prefix
            return wrapAlign(`#${imgCall}`, align);

        case 'table':
            return serializeTable(element, context);

        case 'placeholder':
            return serializePlaceholder(element, context);

        case 'vertical_spacer':
            const spacerHeight = (element as any).height || 50;
            return `#v(${spacerHeight}pt)\n`;

        default:
            return wrapAlign(`${children}\n`, align);
    }
}

/**
 * Convert format string to Typst numbering pattern
 */
function formatToTypstNumbering(format: string | undefined): string {
    switch (format) {
        case 'lower-roman': return '"i"';
        case 'upper-roman': return '"I"';
        case 'lower-alpha': return '"a"';
        case 'upper-alpha': return '"A"';
        case 'decimal':
        default: return '"1"';
    }
}

/**
 * Serialize a placeholder element to Typst
 */
function serializePlaceholder(element: TElement, context: SerializeContext): string {
    const placeholderType = (element as any).placeholderType;
    const format = (element as any).format;
    const offset = (element as any).offset || 0;
    const fontFamily = (element as any).fontFamily;
    const fontSize = (element as any).fontSize;
    const bold = (element as any).bold;
    const italic = (element as any).italic;
    const underline = (element as any).underline;

    let content = '';

    if (placeholderType === 'page') {
        const numbering = formatToTypstNumbering(format);
        if (offset !== 0) {
            // Use counter.step with offset, then display
            content = `#{ counter(page).update(n => n + ${offset}); counter(page).display(${numbering}); counter(page).update(n => n - ${offset}) }`;
            // Simpler approach: just add offset to displayed value
            content = `#numbering(${numbering}, counter(page).get().first() + ${offset})`;
        } else {
            content = `#counter(page).display(${numbering})`;
        }
    } else if (placeholderType === 'totalPages') {
        const numbering = formatToTypstNumbering(format);
        content = `#numbering(${numbering}, counter(page).final().first())`;
    } else if (placeholderType === 'date') {
        // Map format to Typst datetime display format
        let dateFormat = '"[month]/[day]/[year]"'; // default
        switch (format) {
            case 'iso':
                dateFormat = '"[year]-[month padding:zero]-[day padding:zero]"';
                break;
            case 'long':
                dateFormat = '"[month repr:long] [day], [year]"';
                break;
            case 'short':
                dateFormat = '"[month padding:none]/[day padding:none]/[year repr:last_two]"';
                break;
            case 'default':
            default:
                dateFormat = '"[month padding:zero]/[day padding:zero]/[year]"';
                break;
        }
        content = `#datetime.today().display(${dateFormat})`;
    } else if (placeholderType === 'title') {
        content = escapeTypst(context.title || '');
    }

    // Check if content needs context (page numbers, total pages, dates need context)
    // Title is just plain text and doesn't need context
    const needsContext = placeholderType === 'page' || placeholderType === 'totalPages' || placeholderType === 'date';
    
    // If we're NOT inside a context (i.e., in body/front page) and content needs context,
    // we must wrap the entire output in context
    const wrapInContext = needsContext && !context.insideContext;

    // Check if we need any styling
    const hasStyles = bold || italic || underline || fontSize || fontFamily;
    
    if (!hasStyles) {
        // No styling - just return content, wrapped in context if needed
        if (wrapInContext) {
            // Strip the # and wrap in context
            const expr = content.startsWith('#') ? content.slice(1) : content;
            return `#context ${expr}`;
        }
        return content;
    }
    
    // Build style parameters
    const styles: string[] = [];
    if (bold) styles.push('weight: "bold"');
    if (italic) styles.push('style: "italic"');
    if (fontSize) styles.push(`size: ${fixTypstUnit(fontSize)}`);
    if (fontFamily) {
        const cleanFont = fontFamily.replace(/^['"]|['"]$/g, '').split(',')[0].trim();
        styles.push(`font: "${cleanFont}"`);
    }
    
    // Apply styling using #text()[...] wrapper
    // For header/footer (insideContext=true): context propagates into content brackets
    // For body (insideContext=false): we wrap everything in context at the end
    let result = content;
    
    // Apply underline first (innermost)
    if (underline) {
        result = `#underline[${result}]`;
    }
    
    // Apply text styling (outermost)
    if (styles.length > 0) {
        result = `#text(${styles.join(', ')})[${result}]`;
    }
    
    // If content needs context and we're not already inside one, wrap in context
    if (wrapInContext) {
        // The result starts with # - we need to wrap the expression in context
        // Result is like "#text(...)[#counter(...)]" or "#underline[#counter(...)]"
        // We strip the leading # and wrap in #context
        const expr = result.startsWith('#') ? result.slice(1) : result;
        return `#context ${expr}`;
    }
    
    return result;
}

function serializeTable(element: TElement, context: SerializeContext): string {
    const rows = element.children as TElement[];
    if (!rows || rows.length === 0) return '';

    let maxCols = 0;
    rows.forEach(row => {
        if (row.children && row.children.length > maxCols) maxCols = row.children.length;
    });

    // Use 1fr for each column to make the table expand to full width
    const columns = `(${'1fr, '.repeat(maxCols).slice(0, -2)})`;

    // Check if borders should be hidden by examining cell borders
    // Plate stores borders on each cell, not on the table element
    // When "No Border" is selected, cells have borders.{top,right,bottom,left}.size = 0
    let hideBorders = false;
    
    // Check table-level borderNone first
    if ((element as any).borderNone) {
        hideBorders = true;
    } else {
        // Check the first cell's borders as a representative
        const firstRow = rows[0];
        if (firstRow?.children?.length > 0) {
            const firstCell = firstRow.children[0] as any;
            const cellBorders = firstCell?.borders;
            if (cellBorders) {
                // If all border sizes are explicitly 0, hide borders
                const hasNoBorders = 
                    (cellBorders.top?.size === 0 || cellBorders.top?.size === '0') &&
                    (cellBorders.right?.size === 0 || cellBorders.right?.size === '0') &&
                    (cellBorders.bottom?.size === 0 || cellBorders.bottom?.size === '0') &&
                    (cellBorders.left?.size === 0 || cellBorders.left?.size === '0');
                if (hasNoBorders) {
                    hideBorders = true;
                }
            }
        }
    }

    let content = `#table(\n  columns: ${columns},\n`;
    
    // Add stroke: none if borders should be hidden
    if (hideBorders) {
        content += `  stroke: none,\n`;
    }

    rows.forEach(row => {
        (row.children as TElement[]).forEach(cell => {
            const cellContent = serializeNodesToTypst(cell.children, context).trim();
            const isHeader = cell.type === 'th';
            const verticalAlign = (cell as any).verticalAlign as string | undefined;
            
            const finalContent = isHeader ? `*${cellContent}*` : cellContent;
            
            // Use table.cell for individual cell alignment
            if (verticalAlign === 'middle') {
                content += `  table.cell(align: horizon)[${finalContent}],\n`;
            } else if (verticalAlign === 'bottom') {
                content += `  table.cell(align: bottom)[${finalContent}],\n`;
            } else {
                content += `  [${finalContent}],\n`;
            }
        });
    });

    content += `)\n`;
    return content;
}
