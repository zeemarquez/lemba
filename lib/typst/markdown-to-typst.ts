import { Marked } from 'marked';
import markedKatex from "marked-katex-extension";

export function markdownToTypst(markdown: string): string {
    const instance = new Marked();

    instance.use(markedKatex({
        throwOnError: false,
        output: 'html',
        nonStandard: true,
    }));

    const tokens = instance.lexer(markdown || '');
    console.log(`[Typst] [Markdown] Lexed ${tokens.length} tokens.`);

    return parseTokens(tokens);
}

function parseTokens(tokens: any[]): string {
    let output = '';
    for (const token of tokens) {
        output += processToken(token);
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
 * Typst strings use backslashes for escaping, so we must double them.
 */
function escapeTypstString(text: string): string {
    if (!text) return '';
    return text.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

function processToken(token: any): string {
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
                const content = parseTokens(item.tokens).trim();
                const indented = content.split('\n').join('\n  ');
                return `${listType} ${indented}\n`;
            }).join('') + '\n';
        case 'code':
            return "```" + (token.lang || '') + "\n" + token.text + "\n```\n\n";
        case 'blockquote':
            return `#quote(block: true)[${parseTokens(token.tokens)}]\n\n`;
        case 'table':
            const cols = token.header.length;
            let tableContent = `#table(\n  columns: (${'auto, '.repeat(cols).slice(0, -2)}),\n  inset: 10pt,\n  align: horizon,\n`;
            token.header.forEach((cell: any) => {
                tableContent += `  [*${parseInline(cell.tokens)}*],\n`;
            });
            token.rows.forEach((row: any) => {
                row.forEach((cell: any) => {
                    tableContent += `  [${parseInline(cell.tokens)}],\n`;
                });
            });
            tableContent += ')\n\n';
            return tableContent;
        case 'html':
            if (token.text.match(/<!--\s*pagebreak\s*-->/i)) {
                return '#pagebreak()\n\n';
            }
            // Check for <img> tags
            const imgMatch = token.text.match(/<img\s+[^>]*src=["']([^"']+)["']/i);
            if (imgMatch) {
                return `#image("${escapeTypstString(imgMatch[1])}")\n\n`;
            }
            return '';
        case 'hr':
            return '#line(length: 100%)\n\n';
        case 'image':
            return `#image("${escapeTypstString(token.href)}")\n\n`;
        case 'katex':
            return `$ ${fixMathForTypst(token.text)} $\n\n`;
        default:
            return '';
    }
}

function fixMathForTypst(math: string): string {
    if (!math) return '';
    const commandMap: Record<string, string> = {
        '\\sum': ' sum ', '\\prod': ' prod ', '\\int': ' integral ',
        '\\alpha': ' alpha ', '\\beta': ' beta ', '\\gamma': ' gamma ',
        '\\sigma': ' sigma ', '\\pi': ' pi ', '\\infty': ' oo ',
        '\\partial': ' pd ', '\\nabla': ' nabla ', '\\text': ' text ',
        '\\sqrt': ' sqrt ', '\\sin': ' sin ', '\\cos': ' cos ',
        '\\tan': ' tan ', '\\log': ' log ', '\\ln': ' ln ',
        '\\lim': ' lim ', '\\to': ' -> ', '\\rightarrow': ' -> ',
        '\\approx': ' approx ', '\\le': ' <= ', '\\ge': ' >= ',
        '\\neq': ' != ', '\\pm': ' plus.minus ', '\\times': ' * ',
        '\\div': ' / ', '\\cdot': ' dot '
    };
    let processed = math;
    for (const [lat, typ] of Object.entries(commandMap)) {
        processed = processed.split(lat).join(typ);
    }
    processed = processed.replace(/\\frac\s*\{([^{}]+)\}\s*\{([^{}]+)\}/g, ' frac($1, $2) ');
    processed = processed.replace(/\\([a-zA-Z]+)/g, ' $1 ');
    return processed.replace(/[a-zA-Z]{2,}/g, (match) => {
        const typstKeywords = new Set(['sum', 'prod', 'integral', 'frac', 'sqrt', 'sin', 'cos', 'tan', 'log', 'ln', 'lim', 'alpha', 'beta', 'gamma', 'oo']);
        if (typstKeywords.has(match.toLowerCase())) return match;
        return match.split('').join(' ');
    });
}

function parseInline(tokens: any[]): string {
    if (!tokens) return '';
    let output = '';
    for (const token of tokens) {
        switch (token.type) {
            case 'text':
                output += escapeTypst(token.text);
                break;
            case 'strong':
                output += `*${parseInline(token.tokens)}*`;
                break;
            case 'em':
                output += `_${parseInline(token.tokens)}_`;
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
                output += `#image("${escapeTypstString(token.href)}")`;
                break;
            case 'inlineKatex':
                output += `$${fixMathForTypst(token.text)}$`;
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
