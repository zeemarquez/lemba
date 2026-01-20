import type { Descendant, TElement, TText } from 'platejs';
import { fixTypstUnit } from './compiler';

interface SerializeContext {
    title?: string;
}

export function serializeNodesToTypst(nodes: Descendant[], context: SerializeContext = {}): string {
    // We wrap everything in a block or just join them
    // Only blocks need newlines usually.
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
    // Typst doesn't have native underline/strikethrough in markdown syntax, need functions
    if (node.underline) text = `#underline[${text}]`;
    if (node.strikethrough) text = `#strike[${text}]`;
    if (node.subscript) text = `#sub[${text}]`;
    if (node.superscript) text = `#super[${text}]`;

    // Color/Font/Size via styles - wrap in #text()
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

    // Alignment wrapper
    const wrapAlign = (content: string, align?: string) => {
        if (align === 'center') return `#align(center)[${content}]`;
        if (align === 'right') return `#align(right)[${content}]`;
        if (align === 'justify') return `#align(justify)[${content}]`; // default is left/start
        return content;
    };

    const align = element.align as string | undefined;

    switch (element.type) {
        case 'p':
            // Paragraphs in Typst are just text separated by newlines. 
            // But inside a header/footer block, we might want to ensure it stands alone.
            // If we are exporting a list of nodes, we just return the text.
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
            // lang?
            return `\`\`\`\n${element.children.map((c: any) => c.text).join('')}\n\`\`\`\n`;

        case 'ul':
            // Handled by children mostly if they are 'li'
            // But we need to know we are in a list?
            // Simple serialization: just output children.
            return children;
        case 'ol':
            return children;
        case 'li':
            // Check parent type? Assume unordered for now or use +/-
            // We can't easily know parent type here without context or passing it down.
            // But standard markdown uses - for unordered.
            // Let's assume - for now.
            return `- ${children}\n`;

        case 'link':
        case 'a':
            return `#link("${element.url}")[${children}]`;

        case 'img':
        case 'image':
            // Typst image: image("url", width: 50%)
            const widthArg = (element as any).width ? `, width: ${fixTypstUnit((element as any).width)}` : '';
            const src = element.url as string;
            const img = `#image("${src}"${widthArg})`;
            // Check for caption
            if ((element as any).caption) {
                // #figure(image(...), caption: [...])
                // caption might be nodes
                // simplified:
                return `#figure(${img}, caption: [${children}])`;
            }
            return wrapAlign(img, align);

        case 'table':
            // Generate #table(...)
            // Complex because we need to parse children (tr/td) back into table args.
            // This recursive strategy returns string, which makes it hard to reconstruct table args structure.
            // Maybe we can rebuild it from the element structure directly.
            return serializeTable(element, context);

        case 'placeholder':
            if (element.placeholderType === 'page') {
                // current page number
                // Typst: counter(page).display()
                return `#counter(page).display()`;
                // format? Typst supports numbering formats: "1", "a", "i", "I"
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
    // element.children should be 'tr'
    // tr children should be 'td'/'th'

    const rows = element.children as TElement[];
    if (!rows || rows.length === 0) return '';

    // Find max cols
    let maxCols = 0;
    rows.forEach(row => {
        if (row.children && row.children.length > maxCols) maxCols = row.children.length;
    });

    const columns = `(${'auto, '.repeat(maxCols).slice(0, -2)})`;

    let content = `#table(\n  columns: ${columns},\n`;

    rows.forEach(row => {
        (row.children as TElement[]).forEach(cell => {
            // cell content
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
