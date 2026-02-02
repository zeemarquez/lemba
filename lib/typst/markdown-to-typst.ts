import { Marked } from 'marked';
import markedKatex from "marked-katex-extension";
import { texToTypst } from 'tex-to-typst';
import { escapeSvgForTypst, colorToHex, DEFAULT_ALERT_ICONS } from './lucide-svg';

export interface MarkdownToTypstOptions {
    tables?: {
        preventPageBreak?: boolean;
        equalWidthColumns?: boolean;
        alignment?: 'left' | 'center' | 'right';
        maxWidth?: number;
        headerStyle?: {
            bold?: boolean;
            italic?: boolean;
            underline?: boolean;
            backgroundColor?: string;
            textColor?: string;
            textAlign?: 'left' | 'center' | 'right';
        };
        cellStyle?: {
            bold?: boolean;
            italic?: boolean;
            underline?: boolean;
            backgroundColor?: string;
            textColor?: string;
            textAlign?: 'left' | 'center' | 'right';
        };
        border?: {
            width?: string;
            color?: string;
        };
    };
    figures?: {
        captionEnabled?: boolean;
        captionFormat?: string; // e.g., "Figure #: {Caption}"
        defaultWidth?: string;
        defaultHeight?: string;
        margins?: {
            top?: string;
            bottom?: string;
            left?: string;
            right?: string;
        };
        alignment?: 'left' | 'center' | 'right';
    };
    alerts?: {
        showHeader: boolean;
        note?: {
            icon?: string;
            text?: string;
            labelColor?: string;
            backgroundColor?: string;
            textColor?: string;
        };
        tip?: {
            icon?: string;
            text?: string;
            labelColor?: string;
            backgroundColor?: string;
            textColor?: string;
        };
        important?: {
            icon?: string;
            text?: string;
            labelColor?: string;
            backgroundColor?: string;
            textColor?: string;
        };
        warning?: {
            icon?: string;
            text?: string;
            labelColor?: string;
            backgroundColor?: string;
            textColor?: string;
        };
        caution?: {
            icon?: string;
            text?: string;
            labelColor?: string;
            backgroundColor?: string;
            textColor?: string;
        };
    };
    /** Resolved Lucide icon SVGs (icon name -> SVG string) for custom alert icons */
    resolvedLucideSvgs?: Record<string, string>;
}

// Strip frontmatter from markdown content
function stripFrontmatter(content: string): string {
    const frontmatterRegex = /^---\n[\s\S]*?\n---\n?/;
    return content.replace(frontmatterRegex, '');
}

// Track figure numbers globally within a document compilation
let figureCounter = 0;

export function markdownToTypst(markdown: string, options: MarkdownToTypstOptions = {}): string {
    // Reset figure counter at the start of each document
    figureCounter = 0;

    const instance = new Marked();

    instance.use(markedKatex({
        throwOnError: false,
        output: 'html',
        nonStandard: true,
    }));

    // Strip frontmatter (used for variables) before parsing
    const markdownWithoutFrontmatter = stripFrontmatter(markdown || '');

    const tokens = instance.lexer(markdownWithoutFrontmatter);
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

/**
 * Fast regex to detect if text contains any potential emoji characters
 * This is much faster than iterating character by character
 * Matches Unicode ranges where emojis typically appear
 */
const EMOJI_QUICK_TEST = /[\u{1F300}-\u{1F9FF}]|[\u{2600}-\u{27BF}]|[\u{1FA00}-\u{1FAFF}]|[\u{1F1E6}-\u{1F1FF}]|[\u{1F200}-\u{1F2FF}]|[\u2764\u2763\u2665\u2666\u2660\u2663\u270C\u270B\u270A\u270D\u2728\u2B50\u2B55\u274C\u274E\u2753\u2757\u203C\u2049\u00A9\u00AE\u2122]/u;

/**
 * Detects if a codepoint is part of an emoji
 * Uses Unicode ranges for emojis
 */
function isEmojiCodePoint(codePoint: number): boolean {
    return (
        // Emoticons
        (codePoint >= 0x1F600 && codePoint <= 0x1F64F) ||
        // Miscellaneous Symbols and Pictographs
        (codePoint >= 0x1F300 && codePoint <= 0x1F5FF) ||
        // Supplemental Symbols and Pictographs
        (codePoint >= 0x1F900 && codePoint <= 0x1F9FF) ||
        // Symbols and Pictographs Extended-A
        (codePoint >= 0x1FA00 && codePoint <= 0x1FAFF) ||
        // Dingbats
        (codePoint >= 0x2700 && codePoint <= 0x27BF) ||
        // Miscellaneous Symbols
        (codePoint >= 0x2600 && codePoint <= 0x26FF) ||
        // Transport and Map Symbols
        (codePoint >= 0x1F680 && codePoint <= 0x1F6FF) ||
        // Regional Indicator Symbols (flags)
        (codePoint >= 0x1F1E6 && codePoint <= 0x1F1FF) ||
        // Enclosed Alphanumeric Supplement (some emojis like Ⓜ️)
        (codePoint >= 0x1F200 && codePoint <= 0x1F2FF) ||
        // Common emoji-like symbols
        codePoint === 0x2764 || // ❤
        codePoint === 0x2763 || // ❣
        codePoint === 0x2665 || // ♥
        codePoint === 0x2666 || // ♦
        codePoint === 0x2660 || // ♠
        codePoint === 0x2663 || // ♣
        codePoint === 0x270C || // ✌
        codePoint === 0x270B || // ✋
        codePoint === 0x270A || // ✊
        codePoint === 0x270D || // ✍
        codePoint === 0x2728 || // ✨
        codePoint === 0x2B50 || // ⭐
        codePoint === 0x2B55 || // ⭕
        codePoint === 0x274C || // ❌
        codePoint === 0x274E || // ❎
        codePoint === 0x2753 || // ❓
        codePoint === 0x2757 || // ❗
        codePoint === 0x203C || // ‼
        codePoint === 0x2049 || // ⁉
        codePoint === 0x00A9 || // ©
        codePoint === 0x00AE || // ®
        codePoint === 0x2122    // ™
    );
}

/**
 * Convert emoji to Twemoji CDN URL
 * Twemoji uses lowercase hex codepoints separated by dashes
 */
function emojiToTwemojiUrl(emoji: string): string {
    // Get codepoints, excluding variation selector FE0F for the URL
    const codePoints: string[] = [];
    for (const char of emoji) {
        const cp = char.codePointAt(0);
        if (cp !== undefined && cp !== 0xFE0F) { // Skip variation selector-16
            codePoints.push(cp.toString(16).toLowerCase());
        }
    }
    
    // Twemoji CDN URL - using a stable version
    return `https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/svg/${codePoints.join('-')}.svg`;
}

/**
 * Processes text to handle emojis properly in Typst
 * Converts emojis to inline Twemoji SVG images
 * 
 * PERFORMANCE OPTIMIZATION: Uses fast regex pre-check to skip expensive
 * character-by-character iteration when no emojis are present (common case)
 */
function processTextWithEmojis(text: string): string {
    if (!text) return '';
    
    // FAST PATH: If no emojis detected by quick regex, just escape and return
    // This avoids Array.from() and character iteration for most text
    if (!EMOJI_QUICK_TEST.test(text)) {
        return escapeTypst(text);
    }
    
    // SLOW PATH: Text contains emojis, do full processing
    const segments: string[] = [];
    let currentSegment = '';
    let i = 0;
    
    // Use Array.from to properly handle surrogate pairs
    const chars = Array.from(text);
    
    while (i < chars.length) {
        const char = chars[i];
        const codePoint = char.codePointAt(0);
        
        if (codePoint && isEmojiCodePoint(codePoint)) {
            // Save current segment if any
            if (currentSegment) {
                segments.push(escapeTypst(currentSegment));
                currentSegment = '';
            }
            
            // Collect the full emoji sequence
            let emojiSequence = char;
            i++;
            
            // Handle emoji sequences (skin tone modifiers, ZWJ sequences, flags)
            while (i < chars.length) {
                const nextChar = chars[i];
                const nextCodePoint = nextChar.codePointAt(0);
                
                if (nextCodePoint === 0xFE0F || // Variation selector-16
                    nextCodePoint === 0x200D || // Zero-width joiner
                    (nextCodePoint && nextCodePoint >= 0x1F3FB && nextCodePoint <= 0x1F3FF) || // Skin tone modifiers
                    (nextCodePoint && isEmojiCodePoint(nextCodePoint))) {
                    emojiSequence += nextChar;
                    i++;
                } else {
                    break;
                }
            }
            
            // Convert emoji to Twemoji image
            const twemojiUrl = emojiToTwemojiUrl(emojiSequence);
            // Use box with baseline alignment for inline emoji rendering
            // The image will be fetched by processTypstImages later
            segments.push(`#box(baseline: 20%, image("${twemojiUrl}", height: 1em))`);
        } else {
            currentSegment += char;
            i++;
        }
    }
    
    // Add remaining segment
    if (currentSegment) {
        segments.push(escapeTypst(currentSegment));
    }
    
    return segments.join('');
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
        .replace(/\{/g, '\\{')
        .replace(/\}/g, '\\}')
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

function getAlertIconTypst(type: string, colorOverride?: string): string {
    let color = "#0070f3";
    let path = "";
    switch (type) {
        case 'TIP':
            color = "#38b2ac";
            path = "<path d='M9 18h6m-5 4h4m1-10c0-2.209-1.791-4-4-4s-4 1.791-4 4c0 1.25.75 2.33 1.83 2.76.67.27 1.17.9 1.17 1.63V16h2v-1.61c0-.73.5-1.36 1.17-1.63C14.25 12.33 15 11.25 15 10z'></path>";
            break;
        case 'IMPORTANT':
            color = "#9f7aea";
            path = "<path d='M6 3h12l4 6-10 13L2 9z'></path>";
            break;
        case 'WARNING':
            color = "#ed8936";
            path = "<path d='M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z'></path><line x1='12' y1='9' x2='12' y2='13'></line><line x1='12' y1='17' x2='12.01' y2='17'></line>";
            break;
        case 'CAUTION':
            color = "#f56565";
            path = "<path d='M7.86 2h8.28L22 7.86v8.28L16.14 22H7.86L2 16.14V7.86L7.86 2z'></path><line x1='12' y1='8' x2='12' y2='12'></line><line x1='12' y1='16' x2='12.01' y2='16'></line>";
            break;
        case 'NOTE':
        default:
            color = "#0070f3";
            path = "<circle cx='12' cy='12' r='10'></circle><line x1='12' y1='16' x2='12' y2='12'></line><line x1='12' y1='8' x2='12.01' y2='8'></line>";
            break;
    }
    const stroke = colorOverride && /^#[0-9A-Fa-f]{3,8}$/.test(colorOverride) ? colorOverride : color;
    const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24' fill='none' stroke='${stroke}' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'>${path}</svg>`;
    return svg;
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
        case 'blockquote': {
            // Check if it's a GitHub-style alert
            // Handle both escaped and non-escaped versions: [!NOTE] or \[!NOTE] or \[!NOTE\]
            const firstChild = token.tokens?.[0];
            if (firstChild && firstChild.type === 'paragraph') {
                const text = firstChild.text || '';
                const match = text.match(/^\\?\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\\?\]\s*/i);
                if (match) {
                    const type = match[1].toUpperCase();
                    // Remove the alert prefix from the first child text (handle both escaped and non-escaped)
                    firstChild.text = text.replace(/^\\?\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\\?\]\s*/i, '');

                    // Also clean up the nested tokens to prevent duplication in rendering
                    if (firstChild.tokens) {
                        for (let i = 0; i < firstChild.tokens.length; i++) {
                            const subToken = firstChild.tokens[i];
                            if (subToken.type === 'text') {
                                subToken.text = subToken.text.replace(/^\\?\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\\?\]\s*/i, '');
                                // If the text node is now empty, remove it
                                if (subToken.text === '') {
                                    firstChild.tokens.splice(i, 1);
                                    i--;
                                    // Also remove any leading 'br' tokens
                                    while (firstChild.tokens[0]?.type === 'br') {
                                        firstChild.tokens.shift();
                                    }
                                }
                                break;
                            }
                        }
                    }

                    // If the first paragraph is now empty, remove it from the blockquote
                    if (firstChild.text === '' && (!firstChild.tokens || firstChild.tokens.length === 0)) {
                        token.tokens?.shift();
                    }

                    // Get type-specific settings (convert type to lowercase for lookup)
                    const typeKey = type.toLowerCase() as 'note' | 'tip' | 'important' | 'warning' | 'caution';
                    const typeSettings = options.alerts?.[typeKey];

                    // Use customization settings for this specific type, otherwise use defaults
                    const customIcon = typeSettings?.icon;
                    const customText = typeSettings?.text || type;
                    // When no override, use default Lucide icon for this type so PDF uses it on first render
                    const iconToUse = customIcon ?? DEFAULT_ALERT_ICONS[typeKey];

                    // Label color applies to border, icon, and label (when set)
                    const labelHex = colorToHex(typeSettings?.labelColor);

                    // Resolve icon for PDF: custom (emoji or Lucide) or type-based SVG
                    const defaultSvg = getAlertIconTypst(type, labelHex ?? undefined);
                    let iconTypst: string;
                    if (iconToUse?.startsWith('lucide:')) {
                        const name = iconToUse.replace(/^lucide:/, '').trim();
                        const kebab = name.replace(/([a-z])([A-Z])/g, (_: string, a: string, b: string) => `${a}-${b.toLowerCase()}`).replace(/([A-Z])/g, (c: string) => c.toLowerCase()).replace(/^-/, '');
                        const resolved = options.resolvedLucideSvgs?.[name] ?? options.resolvedLucideSvgs?.[kebab];
                        iconTypst = resolved ? `image.decode("${escapeSvgForTypst(resolved)}")` : `image.decode("${escapeSvgForTypst(defaultSvg)}")`;
                    } else if (iconToUse && !iconToUse.startsWith('lucide:')) {
                        iconTypst = `#text(size: 1.1em)[${iconToUse}]`;
                    } else {
                        iconTypst = `image.decode("${escapeSvgForTypst(defaultSvg)}")`;
                    }

                    // Helper function to convert color to Typst format
                    const convertColorToTypst = (color: string | undefined, defaultColor: string): string => {
                        if (!color) return defaultColor;
                        
                        if (color.startsWith('hsla') || color.startsWith('hsl')) {
                            const hslMatch = color.match(/hsla?\((\d+),\s*(\d+)%,\s*(\d+)%/);
                            if (hslMatch) {
                                const h = parseInt(hslMatch[1]) / 360;
                                const s = parseInt(hslMatch[2]) / 100;
                                const l = parseInt(hslMatch[3]) / 100;
                                
                                // HSL to RGB conversion
                                let r, g, b;
                                if (s === 0) {
                                    r = g = b = l;
                                } else {
                                    const hue2rgb = (p: number, q: number, t: number) => {
                                        if (t < 0) t += 1;
                                        if (t > 1) t -= 1;
                                        if (t < 1/6) return p + (q - p) * 6 * t;
                                        if (t < 1/2) return q;
                                        if (t < 2/3) return p + (q - p) * (2/3 - t) * 6;
                                        return p;
                                    };
                                    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
                                    const p = 2 * l - q;
                                    r = hue2rgb(p, q, h + 1/3);
                                    g = hue2rgb(p, q, h);
                                    b = hue2rgb(p, q, h - 1/3);
                                }
                                const hex = '#' + [r, g, b].map(x => {
                                    const hex = Math.round(x * 255).toString(16);
                                    return hex.length === 1 ? '0' + hex : hex;
                                }).join('');
                                return `rgb("${hex}")`;
                            }
                            return defaultColor;
                        } else if (color.startsWith('#')) {
                            return `rgb("${color}")`;
                        } else {
                            return `rgb("${color}")`;
                        }
                    };
                    
                    // Get background color - use type-specific setting or default
                    let backgroundColor: string;
                    switch (type) {
                        case 'TIP':
                            backgroundColor = convertColorToTypst(typeSettings?.backgroundColor, 'rgb("#e6fffa")');
                            break;
                        case 'IMPORTANT':
                            backgroundColor = convertColorToTypst(typeSettings?.backgroundColor, 'rgb("#faf5ff")');
                            break;
                        case 'WARNING':
                            backgroundColor = convertColorToTypst(typeSettings?.backgroundColor, 'rgb("#fffaf0")');
                            break;
                        case 'CAUTION':
                            backgroundColor = convertColorToTypst(typeSettings?.backgroundColor, 'rgb("#fff5f5")');
                            break;
                        case 'NOTE':
                        default:
                            backgroundColor = convertColorToTypst(typeSettings?.backgroundColor, 'rgb("#f0f7ff")');
                            break;
                    }

                    // Stroke (border + label + icon): use labelColor when set, else type defaults
                    let stroke = 'rgb("#0070f3")';
                    if (typeSettings?.labelColor) {
                        stroke = convertColorToTypst(typeSettings.labelColor, stroke);
                    } else {
                        switch (type) {
                            case 'TIP':
                                stroke = 'rgb("#38b2ac")';
                                break;
                            case 'IMPORTANT':
                                stroke = 'rgb("#9f7aea")';
                                break;
                            case 'WARNING':
                                stroke = 'rgb("#ed8936")';
                                break;
                            case 'CAUTION':
                                stroke = 'rgb("#f56565")';
                                break;
                            case 'NOTE':
                            default:
                                stroke = 'rgb("#0070f3")';
                                break;
                        }
                    }

                    // Get text color (body) - use type-specific setting or default to black
                    const textColor = typeSettings?.textColor ? convertColorToTypst(typeSettings.textColor, 'black') : 'black';

                    const showHeader = options.alerts?.showHeader !== false;

                    if (showHeader) {
                        return `#block(fill: ${backgroundColor}, stroke: (left: 4pt + ${stroke}), inset: 12pt, width: 100%, radius: 4pt)[
  #text(fill: ${stroke}, weight: "bold")[#box(height: 1.1em, baseline: 15%, ${iconTypst}) ${customText}] \\
  #text(fill: ${textColor})[${parseTokens(token.tokens, options)}]
]\n\n`;
                    } else {
                        return `#block(fill: ${backgroundColor}, stroke: (left: 4pt + ${stroke}), inset: 12pt, width: 100%, radius: 4pt)[
  #grid(
    columns: (auto, 1fr),
    column-gutter: 12pt,
    smallcaps(text(size: 2.2em, ${iconTypst})),
    align(horizon + left)[#text(fill: ${textColor})[${parseTokens(token.tokens, options)}]]
  )
]\n\n`;
                    }
                }
            }
            return `#quote(block: true)[${parseTokens(token.tokens, options)}]\n\n`;
        }
        case 'table':
            const cols = token.header.length;
            // Get header style settings
            const headerBold = options.tables?.headerStyle?.bold !== false; // Default to true
            const headerItalic = options.tables?.headerStyle?.italic === true;
            const headerUnderline = options.tables?.headerStyle?.underline === true;
            const headerBgColor = options.tables?.headerStyle?.backgroundColor;
            const headerTextColor = options.tables?.headerStyle?.textColor;
            const headerTextAlign = options.tables?.headerStyle?.textAlign || 'left';

            // Get cell style settings
            const cellBold = options.tables?.cellStyle?.bold === true;
            const cellItalic = options.tables?.cellStyle?.italic === true;
            const cellUnderline = options.tables?.cellStyle?.underline === true;
            const cellBgColor = options.tables?.cellStyle?.backgroundColor;
            const cellTextColor = options.tables?.cellStyle?.textColor;
            const cellTextAlign = options.tables?.cellStyle?.textAlign || 'left';

            // Get border settings
            const borderWidth = options.tables?.border?.width;
            const borderColor = options.tables?.border?.color;

            // Determine column sizing based on equalWidthColumns setting
            // When equalWidthColumns is false (default), use 'auto' to auto-size based on content
            // When equalWidthColumns is true, use '1fr' for equal width columns
            const equalWidth = options.tables?.equalWidthColumns === true;
            const columnSpec = equalWidth
                ? `(${'1fr, '.repeat(cols).slice(0, -2)})`
                : `(${'auto, '.repeat(cols).slice(0, -2)})`;

            let tableInner = `table(\n  columns: ${columnSpec},\n  inset: 10pt,\n  align: horizon,\n`;

            // Apply custom border settings
            if (borderWidth || borderColor) {
                const strokeParts: string[] = [];
                if (borderWidth) strokeParts.push(`${borderWidth}pt`);
                if (borderColor) strokeParts.push(`rgb("${borderColor}")`);
                tableInner += `  stroke: ${strokeParts.join(' + ')},\n`;
            }
            // Estimate total lines in the table by counting lines in each cell
            let totalLines = 0;
            const estimatedCharsPerLine = 80; // Rough estimate for text wrapping

            token.header.forEach((cell: any) => {
                const cellContent = parseInline(cell.tokens);
                let formattedContent = cellContent;

                // Count lines in this cell: explicit newlines + estimated wrapping
                const explicitLines = (cellContent.match(/\n/g) || []).length + 1;
                const textWithoutNewlines = cellContent.replace(/\n/g, ' ');
                const estimatedWrappedLines = Math.max(1, Math.ceil(textWithoutNewlines.length / estimatedCharsPerLine));
                const cellLines = Math.max(explicitLines, estimatedWrappedLines);
                totalLines += cellLines;

                // Apply text styles for header cells
                if (headerBold) formattedContent = `*${formattedContent}*`;
                if (headerItalic) formattedContent = `_${formattedContent}_`;
                if (headerUnderline) formattedContent = `#underline[${formattedContent}]`;

                // Apply text color for header cells
                if (headerTextColor) {
                    formattedContent = `#text(fill: rgb("${headerTextColor}"))[${formattedContent}]`;
                }

                // Use textAlign from header style settings
                const cellArgs: string[] = [`align: ${headerTextAlign}`];
                if (headerBgColor) {
                    cellArgs.push(`fill: rgb("${headerBgColor}")`);
                }
                tableInner += `  table.cell(${cellArgs.join(', ')})[${formattedContent}],\n`;
            });
            token.rows.forEach((row: any) => {
                row.forEach((cell: any) => {
                    const cellContent = parseInline(cell.tokens);
                    let formattedContent = cellContent;

                    // Count lines in this cell: explicit newlines + estimated wrapping
                    const explicitLines = (cellContent.match(/\n/g) || []).length + 1;
                    const textWithoutNewlines = cellContent.replace(/\n/g, ' ');
                    const estimatedWrappedLines = Math.max(1, Math.ceil(textWithoutNewlines.length / estimatedCharsPerLine));
                    const cellLines = Math.max(explicitLines, estimatedWrappedLines);
                    totalLines += cellLines;

                    // Apply text styles for regular cells
                    if (cellBold) formattedContent = `*${formattedContent}*`;
                    if (cellItalic) formattedContent = `_${formattedContent}_`;
                    if (cellUnderline) formattedContent = `#underline[${formattedContent}]`;

                    // Apply text color for regular cells
                    if (cellTextColor) {
                        formattedContent = `#text(fill: rgb("${cellTextColor}"))[${formattedContent}]`;
                    }

                    // Use textAlign from cell style settings
                    const cellArgs: string[] = [`align: ${cellTextAlign}`];
                    if (cellBgColor) {
                        cellArgs.push(`fill: rgb("${cellBgColor}")`);
                    }
                    tableInner += `  table.cell(${cellArgs.join(', ')})[${formattedContent}],\n`;
                });
            });
            tableInner += ')';

            // The table needs the # prefix to be a valid Typst expression
            const tableWithPrefix = `#${tableInner}`;

            // Apply maxWidth if specified (as percentage)
            const maxWidth = options.tables?.maxWidth ?? 100;

            // Check if table is too large for a single page - if so, ignore preventPageBreak
            // Estimate: tables with more than 50 total lines are likely too tall for a single page
            // (assuming ~20-30 lines fit on a typical page with margins)
            const shouldPreventPageBreak = options.tables?.preventPageBreak && totalLines <= 50;

            // Apply alignment if specified - cells now have explicit alignment set, so table alignment won't affect them
            const alignment = options.tables?.alignment || 'center';
            let finalTable: string;

            // Wrap in block() if preventPageBreak is enabled and table is not too large
            if (shouldPreventPageBreak) {
                // Combine breakable and width if maxWidth is less than 100%
                const blockArgs: string[] = ['breakable: false'];
                if (maxWidth < 100) {
                    blockArgs.push(`width: ${maxWidth}%`);
                }
                const tableBlock = `#block(${blockArgs.join(', ')})[${tableWithPrefix}]`;

                // Apply alignment to the block
                if (alignment === 'left') {
                    finalTable = `#align(left)[${tableBlock}]`;
                } else if (alignment === 'right') {
                    finalTable = `#align(right)[${tableBlock}]`;
                } else {
                    // center is default
                    finalTable = `#align(center)[${tableBlock}]`;
                }
            } else {
                // Apply maxWidth if less than 100%
                let tableWithWidth = tableWithPrefix;
                if (maxWidth < 100) {
                    tableWithWidth = `#block(width: ${maxWidth}%)[${tableWithPrefix}]`;
                }

                // Apply alignment directly to the table (or table with width block)
                if (alignment === 'left') {
                    finalTable = `#align(left)[${tableWithWidth}]`;
                } else if (alignment === 'right') {
                    finalTable = `#align(right)[${tableWithWidth}]`;
                } else {
                    // center is default
                    finalTable = `#align(center)[${tableWithWidth}]`;
                }
            }

            return `${finalTable}\n\n`;
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

                // Use explicit dimensions if present, otherwise use defaults from template
                let args = '';
                const width = widthMatch ? widthMatch[1] : options.figures?.defaultWidth;
                const height = heightMatch ? heightMatch[1] : options.figures?.defaultHeight;
                if (width) args += `, width: ${fixTypstUnit(width)}`;
                if (height) args += `, height: ${fixTypstUnit(height)}`;

                const imgCall = `image("${escapeTypstString(src)}"${args})`;

                // 2. Parse Alignment - use explicit if present, otherwise use default from template
                const alignMatch = token.text.match(/data-align=["'](left|center|right)["']/i);
                let align = alignMatch ? alignMatch[1] : undefined;

                if (!align) {
                    if (token.text.includes('margin-left: auto') && token.text.includes('margin-right: auto')) {
                        align = 'center';
                    } else if (token.text.includes('margin-left: auto')) {
                        align = 'right';
                    }
                }

                // Apply default alignment from template if not specified in image
                if (!align) {
                    align = options.figures?.alignment || 'center';
                }

                // 3. Parse figcaption attribute
                const figcaptionMatch = token.text.match(/figcaption=["']([^"']*)["']/i);
                const figcaption = figcaptionMatch ? figcaptionMatch[1] : undefined;

                // 4. Build margins block if specified
                const margins = options.figures?.margins;
                const hasMargins = margins && (margins.top || margins.bottom || margins.left || margins.right);

                // 5. If we have a caption and captions are enabled, use Typst figure
                const captionEnabled = options.figures?.captionEnabled ?? true;
                if (figcaption && captionEnabled) {
                    figureCounter++;
                    const captionFormat = options.figures?.captionFormat || 'Figure #: {Caption}';
                    // Replace # with figure number and {Caption} with the actual caption text
                    const formattedCaption = captionFormat
                        .replace('#', String(figureCounter))
                        .replace('{Caption}', figcaption);

                    // Use Typst figure with custom caption (supplement: none to remove default "Figure" text since we handle it ourselves)
                    let figureCall = `#figure(${imgCall}, caption: [${processTextWithEmojis(formattedCaption)}], supplement: none)`;

                    // Apply alignment
                    if (align === 'center') figureCall = `#align(center)[${figureCall}]`;
                    else if (align === 'right') figureCall = `#align(right)[${figureCall}]`;

                    // Wrap with block for margins
                    if (hasMargins) {
                        const marginArgs: string[] = [];
                        if (margins.top) marginArgs.push(`above: ${fixTypstUnit(margins.top)}`);
                        if (margins.bottom) marginArgs.push(`below: ${fixTypstUnit(margins.bottom)}`);
                        if (margins.left || margins.right) {
                            const inset: string[] = [];
                            if (margins.left) inset.push(`left: ${fixTypstUnit(margins.left)}`);
                            if (margins.right) inset.push(`right: ${fixTypstUnit(margins.right)}`);
                            marginArgs.push(`inset: (${inset.join(', ')})`);
                        }
                        return `#block(${marginArgs.join(', ')})[${figureCall}]\n\n`;
                    }
                    return `${figureCall}\n\n`;
                }

                // Image without caption
                let result = `#${imgCall}`;
                if (align === 'center') result = `#align(center)[${result}]`;
                else if (align === 'right') result = `#align(right)[${result}]`;

                // Wrap with block for margins
                if (hasMargins) {
                    const marginArgs: string[] = [];
                    if (margins.top) marginArgs.push(`above: ${fixTypstUnit(margins.top)}`);
                    if (margins.bottom) marginArgs.push(`below: ${fixTypstUnit(margins.bottom)}`);
                    if (margins.left || margins.right) {
                        const inset: string[] = [];
                        if (margins.left) inset.push(`left: ${fixTypstUnit(margins.left)}`);
                        if (margins.right) inset.push(`right: ${fixTypstUnit(margins.right)}`);
                        marginArgs.push(`inset: (${inset.join(', ')})`);
                    }
                    return `#block(${marginArgs.join(', ')})[${result}]\n\n`;
                }
                return `${result}\n\n`;
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
        let value = result.value || latex;
        // Prevent unclosed delimiter: escape any $ in converted math so our $ ... $ wrapper stays balanced
        if (value.includes('$')) value = value.replace(/\$/g, '\\$');
        return value;
    } catch (error) {
        console.error('[Typst] Failed to convert LaTeX to Typst:', error);
        // Return the original if conversion fails (escape $ so it doesn't break outer math delimiters)
        return latex.replace(/\$/g, '\\$');
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
                output += processTextWithEmojis(token.text);
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
                output += processTextWithEmojis(token.text);
                break;
            case 'del':
                output += `#strike[${parseInline(token.tokens)}]`;
                break;
            default:
                if (token.raw) output += processTextWithEmojis(token.raw);
        }
    }
    return output;
}
