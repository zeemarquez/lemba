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
            const args: string[] = [];

            // Priority: width, then maxWidth/maxWidth
            if (e.width) {
                args.push(`width: ${fixTypstUnit(e.width)}`);
            } else if (e.style?.width) {
                args.push(`width: ${fixTypstUnit(e.style.width)}`);
            }

            if (e.height) {
                args.push(`height: ${fixTypstUnit(e.height)}`);
            } else if (e.style?.height) {
                args.push(`height: ${fixTypstUnit(e.style.height)}`);
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

    const columns = `(${'auto, '.repeat(maxCols).slice(0, -2)})`;

    let content = `#table(\n  columns: ${columns},\n`;

    rows.forEach(row => {
        (row.children as TElement[]).forEach(cell => {
            const cellContent = serializeNodesToTypst(cell.children, context).trim();
            const isHeader = cell.type === 'th';
            if (isHeader) {
                content += `  [*${cellContent}*],\n`;
            } else {
                content += `  [${cellContent}],\n`;
            }
        });
    });

    content += `)\n`;
    return content;
}
