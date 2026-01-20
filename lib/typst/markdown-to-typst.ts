import { Marked } from 'marked';
import markedKatex from "marked-katex-extension";

export function markdownToTypst(markdown: string): string {
    const instance = new Marked();

    // Configure with KaTeX extension to identify math tokens
    instance.use(markedKatex({
        throwOnError: false,
        output: 'html', // Used by renderer, but we just want tokens
        nonStandard: true, // Support $ math
    }));

    // lexer is a method on the instance that returns tokens
    const tokens = instance.lexer(markdown);
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
    // Escape special Typst characters in text content
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
                // Adjust indentation for nested lists
                const content = parseTokens(item.tokens).trim();
                // Indent subsequent lines of the item
                const indented = content.split('\n').join('\n  ');
                return `${listType} ${indented}\n`;
            }).join('') + '\n';
        case 'code':
            const lang = token.lang || '';
            return "```" + lang + "\n" + token.text + "\n```\n\n";
        case 'blockquote':
            return `#quote(block: true)[${parseTokens(token.tokens)}]\n\n`;
        case 'table':
            // token.header, token.rows
            const cols = token.header.length;
            let tableContent = `#table(\n  columns: (${'auto, '.repeat(cols).slice(0, -2)}),\n  inset: 10pt,\n  align: horizon,\n`;

            // Header
            token.header.forEach((cell: any) => {
                tableContent += `  [*${parseInline(cell.tokens)}*],\n`;
            });

            // Rows
            token.rows.forEach((row: any) => {
                row.forEach((cell: any) => {
                    tableContent += `  [${parseInline(cell.tokens)}],\n`;
                });
            });

            tableContent += ')\n\n';
            return tableContent;

        case 'html': // Check for page break
            if (token.text.match(/<!--\s*pagebreak\s*-->/i)) {
                return '#pagebreak()\n\n';
            }
            return '';
        case 'hr':
            return '#line(length: 100%)\n\n';
        case 'image':
            return `#image("${token.href}")\n\n`;
        case 'katex': // Block math
            return `$ ${fixMathForTypst(token.text)} $\n\n`;
        default:
            // console.log('Unknown token:', token.type);
            return '';
    }
}

function fixMathForTypst(math: string): string {
    if (!math) return '';

    // 1. Map common LaTeX commands to Typst math equivalents
    const commandMap: Record<string, string> = {
        '\\sum': ' sum ',
        '\\prod': ' prod ',
        '\\int': ' integral ',
        '\\alpha': ' alpha ',
        '\\beta': ' beta ',
        '\\gamma': ' gamma ',
        '\\sigma': ' sigma ',
        '\\pi': ' pi ',
        '\\infty': ' oo ',
        '\\partial': ' pd ',
        '\\nabla': ' nabla ',
        '\\text': ' text ',
        '\\sqrt': ' sqrt ',
        '\\sin': ' sin ',
        '\\cos': ' cos ',
        '\\tan': ' tan ',
        '\\log': ' log ',
        '\\ln': ' ln ',
        '\\lim': ' lim ',
        '\\to': ' -> ',
        '\\rightarrow': ' -> ',
        '\\leftarrow': ' <- ',
        '\\approx': ' approx ',
        '\\not': ' not ',
        '\\le': ' <= ',
        '\\ge': ' >= ',
        '\\neq': ' != ',
        '\\pm': ' plus.minus ',
        '\\times': ' * ',
        '\\div': ' / ',
        '\\cdot': ' dot ',
        '\\dots': ' dots ',
        '\\forall': ' forall ',
        '\\exists': ' exists '
    };

    let processed = math;
    for (const [lat, typ] of Object.entries(commandMap)) {
        processed = processed.split(lat).join(typ);
    }

    // 2. Structural additions: \frac{a}{b} -> frac(a, b)
    processed = processed.replace(/\\frac\s*\{([^{}]+)\}\s*\{([^{}]+)\}/g, ' frac($1, $2) ');

    // 3. Strip remaining backslashes for unmapped symbols
    processed = processed.replace(/\\([a-zA-Z]+)/g, ' $1 ');

    // 4. Identifier spacing: E=mc^2 -> E = m c^2
    const typstKeywords = new Set([
        'sum', 'prod', 'integral', 'frac', 'sqrt', 'sin', 'cos', 'tan', 'log', 'ln', 'lim',
        'alpha', 'beta', 'gamma', 'delta', 'epsilon', 'zeta', 'eta', 'theta', 'iota', 'kappa',
        'lambda', 'mu', 'nu', 'xi', 'omicron', 'pi', 'rho', 'sigma', 'tau', 'upsilon', 'phi',
        'chi', 'psi', 'omega', 'oo', 'text', 'in', 'and', 'or', 'not', 'diff'
    ]);

    return processed.replace(/[a-zA-Z]{2,}/g, (match) => {
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
                output += `#link("${token.href}")[${parseInline(token.tokens)}]`;
                break;
            case 'image':
                output += `#image("${token.href}")`;
                break;
            case 'inlineKatex':
                output += `$${fixMathForTypst(token.text)}$`;
                break;
            case 'escape':
                output += escapeTypst(token.text);
                break;
            case 'del': // Strikethrough (remark GFM)
                output += `#strike[${parseInline(token.tokens)}]`;
                break;
            default:
                if (token.raw) output += escapeTypst(token.raw);
        }
    }
    return output;
}
