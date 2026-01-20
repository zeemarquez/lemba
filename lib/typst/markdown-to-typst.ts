import { Marked } from 'marked';
import markedKatex from "marked-katex-extension";
import { texToTypst } from 'tex-to-typst';

export interface MarkdownToTypstOptions {
    tables?: {
        preventPageBreak?: boolean;
    };
}

export function markdownToTypst(markdown: string, options: MarkdownToTypstOptions = {}): string {
    const instance = new Marked();

    instance.use(markedKatex({
        throwOnError: false,
        output: 'html',
        nonStandard: true,
    }));

    const tokens = instance.lexer(markdown || '');
    console.log(`[Typst] [Markdown] Lexed ${tokens.length} tokens.`);

    return parseTokens(tokens, options);
}

function parseTokens(tokens: any[], options: MarkdownToTypstOptions = {}): string {
    let output = '';
    for (const token of tokens) {
        output += processToken(token, options);
    }
    return output;
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
 * Normalizes a unit for Typst (e.g. 500 -> 500pt, 50% -> 50%, 100px -> 100pt)
 */
function fixTypstUnit(value: string | number | undefined): string {
    if (value === undefined || value === null || value === '') return '';
    const s = String(value).trim();
    if (/^\d+(\.\d+)?$/.test(s)) return s + 'pt';
    if (s.toLowerCase().endsWith('px')) {
        return s.toLowerCase().replace('px', 'pt');
    }
    return s;
}

function processToken(token: any, options: MarkdownToTypstOptions = {}): string {
    switch (token.type) {
        case 'space':
            return '';
        case 'heading':
            let prefix = '='.repeat(token.depth);
            return `${prefix} ${parseInline(token.tokens)}\n\n`;
        case 'paragraph':
            return `${parseInline(token.tokens)}\n\n`;
        case 'text':
            return parseInline(token.tokens || []);
        case 'list':
            const listType = token.ordered ? '+' : '-';
            return token.items.map((item: any) => {
                const content = parseTokens(item.tokens, options).trim();
                const indented = content.split('\n').join('\n  ');
                return `${listType} ${indented}\n`;
            }).join('') + '\n';
        case 'code':
            return "```" + (token.lang || '') + "\n" + token.text + "\n```\n\n";
        case 'blockquote':
            return `#quote(block: true)[${parseTokens(token.tokens, options)}]\n\n`;
        case 'table':
            const cols = token.header.length;
            // Use 1fr for each column to make the table expand to full width
            let tableInner = `table(\n  columns: (${'1fr, '.repeat(cols).slice(0, -2)}),\n  inset: 10pt,\n  align: horizon,\n`;
            token.header.forEach((cell: any) => {
                tableInner += `  [*${parseInline(cell.tokens)}*],\n`;
            });
            token.rows.forEach((row: any) => {
                row.forEach((cell: any) => {
                    tableInner += `  [${parseInline(cell.tokens)}],\n`;
                });
            });
            tableInner += ')';
            
            // Wrap in block(breakable: false) if table continuity (prevent page break) is enabled
            if (options.tables?.preventPageBreak) {
                return `#block(breakable: false, ${tableInner})\n\n`;
            }
            return `#${tableInner}\n\n`;
        case 'html':
            if (token.text.match(/<!--\s*pagebreak\s*-->/i)) {
                return '#pagebreak()\n\n';
            }
            // Parse <img> tags for sizing and alignment (Plate serializes resized images as HTML)
            const imgMatch = token.text.match(/<img\s+[^>]*src=["']([^"']+)["'][^>]*>/i);
            if (imgMatch) {
                const src = imgMatch[1];

                // 1. Parse Width/Height (search in both property and style formats)
                // Looks for: width="100", width: 100px, width: 50%
                const widthMatch = token.text.match(/width[:=]\s*["']?(\d+(?:px|%)?)["']?/i);
                const heightMatch = token.text.match(/height[:=]\s*["']?(\d+(?:px|%)?)["']?/i);

                let args = '';
                if (widthMatch) args += `, width: ${fixTypstUnit(widthMatch[1])}`;
                if (heightMatch) args += `, height: ${fixTypstUnit(heightMatch[1])}`;

                const imgCall = `#image("${escapeTypstString(src)}"${args})`;

                // 2. Parse Alignment
                const alignMatch = token.text.match(/data-align=["'](left|center|right)["']/i);
                let align = alignMatch ? alignMatch[1] : undefined;

                if (!align) {
                    if (token.text.includes('margin-left: auto') && token.text.includes('margin-right: auto')) {
                        align = 'center';
                    } else if (token.text.includes('margin-left: auto')) {
                        align = 'right';
                    }
                }

                if (align === 'center') return `#align(center)[${imgCall}]\n\n`;
                if (align === 'right') return `#align(right)[${imgCall}]\n\n`;
                return `${imgCall}\n\n`;
            }
            return '';
        case 'hr':
            return '#line(length: 100%)\n\n';
        case 'image':
            // Check for common markdown image size extension: ![alt](url){width=50%}
            // or just url?size=200x200
            let href = token.href;
            let width = '';
            let height = '';

            // Handle URL query params like ?width=200
            if (href.includes('?')) {
                try {
                    const [baseUrl, query] = href.split('?');
                    const params = new URLSearchParams(query);
                    if (params.has('width')) {
                        width = fixTypstUnit(params.get('width')!);
                        // Keep the query in href for fetches, or strip if it's local?
                        // Usually safer to keep it.
                    }
                    if (params.has('height')) {
                        height = fixTypstUnit(params.get('height')!);
                    }
                } catch { }
            }

            let extraArgs = '';
            if (width) extraArgs += `, width: ${width}`;
            if (height) extraArgs += `, height: ${height}`;

            return `#image("${escapeTypstString(href)}"${extraArgs})\n\n`;
        case 'katex':
        case 'blockKatex':
            // Block/display math: use spaces around content for Typst display mode
            return `$ ${convertLatexToTypst(token.text)} $\n\n`;
        default:
            return '';
    }
}

function convertLatexToTypst(latex: string): string {
    if (!latex) return '';
    try {
        const result = texToTypst(latex);
        return result.value || latex;
    } catch (error) {
        console.error('[Typst] Failed to convert LaTeX to Typst:', error);
        // Return the original if conversion fails
        return latex;
    }
}

function parseInline(tokens: any[]): string {
    if (!tokens) return '';
    let output = '';
    for (let i = 0; i < tokens.length; i++) {
        const token = tokens[i];
        const nextToken = tokens[i + 1];
        switch (token.type) {
            case 'text':
                output += escapeTypst(token.text);
                break;
            case 'strong':
                // In Typst, *bold* followed immediately by a word character causes "unclosed delimiter"
                // We need to add #[] (empty content) to separate the closing * from the following text
                const needsSeparator = nextToken?.type === 'text' && /^[a-zA-Z0-9]/.test(nextToken.text || '');
                output += `*${parseInline(token.tokens)}*${needsSeparator ? '#[]' : ''}`;
                break;
            case 'em':
                // Same issue applies to italic with underscore
                const needsItalicSeparator = nextToken?.type === 'text' && /^[a-zA-Z0-9]/.test(nextToken.text || '');
                output += `_${parseInline(token.tokens)}_${needsItalicSeparator ? '#[]' : ''}`;
                break;
            case 'codespan':
                output += `\`${token.text.replace(/`/g, '\\`')}\``;
                break;
            case 'br':
                output += ' \n';
                break;
            case 'link':
                output += `#link("${escapeTypstString(token.href)}")[${parseInline(token.tokens)}]`;
                break;
            case 'image':
                // Inline images in typst are just #image calls
                let href = token.href;
                let w = '';
                if (href.includes('?')) {
                    const params = new URLSearchParams(href.split('?')[1]);
                    if (params.has('width')) w = fixTypstUnit(params.get('width')!);
                }
                output += `#image("${escapeTypstString(href)}"${w ? `, width: ${w}` : ''})`;
                break;
            case 'inlineKatex':
                // Check displayMode: true means block/display math ($$...$$), false means inline ($...$)
                if (token.displayMode) {
                    // Display mode math: use spaces for Typst block display
                    output += `$ ${convertLatexToTypst(token.text)} $`;
                } else {
                    // Inline math: no spaces for Typst inline mode
                    output += `$${convertLatexToTypst(token.text)}$`;
                }
                break;
            case 'escape':
                output += escapeTypst(token.text);
                break;
            case 'del':
                output += `#strike[${parseInline(token.tokens)}]`;
                break;
            default:
                if (token.raw) output += escapeTypst(token.raw);
        }
    }
    return output;
}
