import type { Descendant, TElement, TText } from 'platejs';
import { fixTypstUnit } from './client-compiler';

interface SerializeContext {
    title?: string;
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
            // Apply 0.5 scaling factor for header/footer images
            const imgScaleFactor = 0.25;
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
            if (element.placeholderType === 'page') {
                return `#counter(page).display()`;
            }
            if (element.placeholderType === 'date') {
                return `#datetime.today().display()`;
            }
            if (element.placeholderType === 'title') {
                return escapeTypst(context.title || '');
            }
            return '';

        default:
            return wrapAlign(`${children}\n`, align);
    }
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
