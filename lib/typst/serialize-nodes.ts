import type { Descendant, TElement, TText } from 'platejs';
import { fixTypstUnit } from './client-compiler';
import { escapeSvgForTypst, colorToHex, DEFAULT_ALERT_ICONS } from './lucide-svg';

interface SerializeContext {
    title?: string;
    scaleImages?: boolean;
    /** If true, content is for header/footer which is already wrapped in context expression */
    insideContext?: boolean;
    /** Table settings from template */
    tables?: {
        preventPageBreak?: boolean;
        equalWidthColumns?: boolean;
        alignment?: 'left' | 'center' | 'right';
        maxWidth?: number;
        minWidth?: number;
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
    /** Global page number offset from template settings */
    pageNumberOffset?: number;
    /** Variable values from document frontmatter */
    variables?: Record<string, string>;
    /** Figures settings from template */
    figures?: {
        captionEnabled?: boolean;
        captionFormat?: string;
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
    /** Internal figure counter - managed during serialization */
    _figureCounter?: { value: number };
}

export function serializeNodesToTypst(nodes: Descendant[], context: SerializeContext = {}): string {
    // Initialize figure counter if not present
    if (!context._figureCounter) {
        context._figureCounter = { value: 0 };
    }
    return nodes.map(node => serializeNode(node, context)).join('\n');
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

function serializeNode(node: Descendant, context: SerializeContext, nextSibling?: Descendant): string {
    if ('text' in node) {
        return serializeTextNode(node as TText, nextSibling);
    } else {
        return serializeElementNode(node as TElement, context);
    }
}

/**
 * Check if the next sibling starts with a word character (letter or digit).
 * In Typst, *bold* or _italic_ followed immediately by a word character causes "unclosed delimiter" error.
 */
function nextStartsWithWordChar(nextSibling?: Descendant): boolean {
    if (!nextSibling) return false;
    if ('text' in nextSibling) {
        const text = (nextSibling as TText).text || '';
        return /^[a-zA-Z0-9]/.test(text);
    }
    return false;
}

function serializeTextNode(node: TText, nextSibling?: Descendant): string {
    let text = processTextWithEmojis(node.text || '');

    // Check if we need to add separator after bold/italic to prevent "unclosed delimiter" error
    // This happens when *bold* or _italic_ is immediately followed by a word character
    const needsBoldSeparator = node.bold && nextStartsWithWordChar(nextSibling);
    const needsItalicSeparator = node.italic && !node.bold && nextStartsWithWordChar(nextSibling);

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

    // Add #[] separator after bold/italic if next text starts with word character
    if (needsBoldSeparator || needsItalicSeparator) {
        text += '#[]';
    }

    return text;
}

function serializeElementNode(element: TElement, context: SerializeContext): string {
    const children = element.children?.map((c, i, arr) => serializeNode(c, context, arr[i + 1])).join('') || '';

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

        case 'callout': {
            const icon = (element as any).icon;
            let type = 'NOTE';
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
            }

            // Get type-specific settings (convert type to lowercase for lookup)
            const typeKey = type.toLowerCase() as 'note' | 'tip' | 'important' | 'warning' | 'caution';
            const typeSettings = context.alerts?.[typeKey];

            // Use customization settings for this specific type, otherwise use defaults
            const customIcon = typeSettings?.icon || icon;
            const customText = typeSettings?.text || type;
            // When no override, use default Lucide icon for this type so PDF uses it on first render
            const iconToUse = customIcon || DEFAULT_ALERT_ICONS[typeKey];

            // Label color applies to border, icon, and label (when set)
            const labelHex = colorToHex(typeSettings?.labelColor);

            // Resolve icon for PDF: custom (emoji or Lucide) or type-based SVG
            const defaultSvg = getAlertIconTypst(type, labelHex ?? undefined);
            let iconTypst: string;
            if (iconToUse?.startsWith('lucide:')) {
                const name = iconToUse.replace(/^lucide:/, '').trim();
                const kebab = name.replace(/([a-z])([A-Z])/g, (_: string, a: string, b: string) => `${a}-${b.toLowerCase()}`).replace(/([A-Z])/g, (c: string) => c.toLowerCase()).replace(/^-/, '');
                const resolved = context.resolvedLucideSvgs?.[name] ?? context.resolvedLucideSvgs?.[kebab];
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
                                if (t < 1 / 6) return p + (q - p) * 6 * t;
                                if (t < 1 / 2) return q;
                                if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
                                return p;
                            };
                            const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
                            const p = 2 * l - q;
                            r = hue2rgb(p, q, h + 1 / 3);
                            g = hue2rgb(p, q, h);
                            b = hue2rgb(p, q, h - 1 / 3);
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

            const showHeader = context.alerts?.showHeader !== false;

            if (showHeader) {
                return `#block(fill: ${backgroundColor}, stroke: (left: 4pt + ${stroke}), inset: 12pt, width: 100%, radius: 4pt)[
  #text(fill: ${stroke}, weight: "bold")[#box(height: 1.1em, baseline: 15%, ${iconTypst}) ${customText}] \\
  #text(fill: ${textColor})[${children}]
]\n`;
            } else {
                return `#block(fill: ${backgroundColor}, stroke: (left: 4pt + ${stroke}), inset: 12pt, width: 100%, radius: 4pt)[
  #grid(
    columns: (auto, 1fr),
    column-gutter: 12pt,
    smallcaps(text(size: 2.2em, ${iconTypst})),
    align(horizon + left)[#text(fill: ${textColor})[${children}]]
  )
]\n`;
            }
        }

        case 'code_block':
            const lang = (element as any).lang || '';
            return `\`\`\`${lang}\n${element.children.map((c: any) => c.text).join('')}\n\`\`\`\n`;

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

            // Priority: width, then maxWidth/maxWidth, then default from template
            if (e.width) {
                args.push(`width: ${scaleTypstUnit(e.width, imgScaleFactor)}`);
            } else if (e.style?.width) {
                args.push(`width: ${scaleTypstUnit(e.style.width, imgScaleFactor)}`);
            } else if (context.figures?.defaultWidth) {
                args.push(`width: ${scaleTypstUnit(context.figures.defaultWidth, imgScaleFactor)}`);
            }

            if (e.height) {
                args.push(`height: ${scaleTypstUnit(e.height, imgScaleFactor)}`);
            } else if (e.style?.height) {
                args.push(`height: ${scaleTypstUnit(e.style.height, imgScaleFactor)}`);
            } else if (context.figures?.defaultHeight) {
                args.push(`height: ${scaleTypstUnit(context.figures.defaultHeight, imgScaleFactor)}`);
            }

            const imgArgs = args.length > 0 ? `, ${args.join(', ')}` : '';
            const imgCall = `image("${escapeTypstString(src)}"${imgArgs})`;

            // Check for figcaption attribute or caption property
            const figcaptionText = e.figcaption || (e.caption ? (Array.isArray(e.caption) ? e.caption.map((c: any) => c.text || '').join('') : e.caption) : '');
            const captionEnabled = context.figures?.captionEnabled ?? true;

            // Use align from element, or default from template
            const imgAlign = align || context.figures?.alignment;

            // Helper to wrap content with alignment
            const wrapImgAlign = (content: string) => {
                if (imgAlign === 'center') return `#align(center)[${content}]`;
                if (imgAlign === 'right') return `#align(right)[${content}]`;
                return content;
            };

            // Helper to wrap content with margins block
            const wrapMargins = (content: string) => {
                const margins = context.figures?.margins;
                const hasMargins = margins && (margins.top || margins.bottom || margins.left || margins.right);
                if (!hasMargins) return content;

                const marginArgs: string[] = [];
                if (margins.top) marginArgs.push(`above: ${fixTypstUnit(margins.top)}`);
                if (margins.bottom) marginArgs.push(`below: ${fixTypstUnit(margins.bottom)}`);
                if (margins.left || margins.right) {
                    const inset: string[] = [];
                    if (margins.left) inset.push(`left: ${fixTypstUnit(margins.left)}`);
                    if (margins.right) inset.push(`right: ${fixTypstUnit(margins.right)}`);
                    marginArgs.push(`inset: (${inset.join(', ')})`);
                }
                return `#block(${marginArgs.join(', ')})[${content}]`;
            };

            if (figcaptionText && captionEnabled) {
                // Increment figure counter
                if (context._figureCounter) {
                    context._figureCounter.value++;
                }
                const figNum = context._figureCounter?.value || 1;
                const captionFormat = context.figures?.captionFormat || 'Figure #: {Caption}';
                // Replace # with figure number and {Caption} with the actual caption text
                const formattedCaption = captionFormat
                    .replace('#', String(figNum))
                    .replace('{Caption}', figcaptionText);

                // Use Typst figure with custom caption (supplement: none to remove default "Figure" text since we handle it ourselves)
                const figureCall = `#figure(${imgCall}, caption: [${processTextWithEmojis(formattedCaption)}], supplement: none)`;
                return wrapMargins(wrapImgAlign(figureCall));
            }

            // If it's a block level image (default in markdown usually), we can use the # prefix
            return wrapMargins(wrapImgAlign(`#${imgCall}`));

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
    // Use global page number offset from context (template settings)
    const offset = context.pageNumberOffset || 0;
    const fontFamily = (element as any).fontFamily;
    const fontSize = (element as any).fontSize;
    const bold = (element as any).bold;
    const italic = (element as any).italic;
    const underline = (element as any).underline;

    let content = '';

    if (placeholderType === 'page') {
        const numbering = formatToTypstNumbering(format);
        if (offset !== 0) {
            // Add offset to displayed value, but only show if result is >= 1
            content = `#{ let p = counter(page).get().first() + ${offset}; if p >= 1 { numbering(${numbering}, p) } }`;
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
        content = processTextWithEmojis(context.title || '');
    } else if (placeholderType === 'variable') {
        const variableName = (element as any).variableName;
        const variableValue = context.variables?.[variableName] || '';
        content = processTextWithEmojis(variableValue);
    }

    // Check if content needs context (page numbers, total pages, dates need context)
    // Title, variables are just plain text and don't need context
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

    const isHeaderFooter = context.insideContext === true;
    const minWidth = isHeaderFooter ? 100 : (context.tables?.minWidth ?? 0);
    const maxWidth = isHeaderFooter ? 100 : (context.tables?.maxWidth ?? 100);

    // Pre-calculate column content lengths
    const colWidths = new Array(maxCols).fill(0);
    // Rough estimate of character width ratios (Typst is variable width, but this is a heuristic)
    // We'll iterate all cells to find the max content length per column
    rows.forEach(row => {
        if (!row.children) return;
        (row.children as TElement[]).forEach((cell, colIndex) => {
            if (colIndex >= maxCols) return;
            // Get raw text content length
            const cellText = serializeNodesToTypst(cell.children, context).replace(/#.*?\[|\]/g, '').length;
            if (cellText > colWidths[colIndex]) {
                colWidths[colIndex] = cellText;
            }
        });
    });

    // Ensure no column has width 0 (avoid 0fr)
    for (let i = 0; i < maxCols; i++) {
        if (colWidths[i] < 1) colWidths[i] = 1; // Minimum weight
    }

    const hasWidthConstraints = (minWidth > 0) || (maxWidth > 0 && maxWidth < 100);
    const forceEqualWidth = isHeaderFooter || context.tables?.equalWidthColumns === true;

    let columns = '';
    if (forceEqualWidth) {
        columns = `(${'1fr, '.repeat(maxCols).slice(0, -2)})`;
    } else if (hasWidthConstraints) {
        // Use weighted fr units based on content length
        // This makes the table fill the container (because of fr units)
        // while maintaining relative column sizes (approximate "auto" behavior)
        const totalWidth = colWidths.reduce((a, b) => a + b, 0);
        // Normalize to be cleaner numbers if possible, but raw char counts work fine as ratios
        columns = `(${colWidths.map(w => w + 'fr').join(', ')})`;
    } else {
        // Default auto sizing (hugs content, does not fill width)
        columns = `(${'auto, '.repeat(maxCols).slice(0, -2)})`;
    }

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

    let tableContent = `table(\n  columns: ${columns},\n`;

    // Add stroke settings
    if (hideBorders) {
        tableContent += `  stroke: none,\n`;
    } else {
        // Apply custom border settings from template
        const borderWidth = context.tables?.border?.width;
        const borderColor = context.tables?.border?.color;

        if (borderWidth || borderColor) {
            const strokeParts: string[] = [];
            if (borderWidth) strokeParts.push(`${borderWidth}pt`);
            if (borderColor) strokeParts.push(`rgb("${borderColor}")`);
            tableContent += `  stroke: ${strokeParts.join(' + ')},\n`;
        }
    }

    // Get header style settings
    const headerBold = context.tables?.headerStyle?.bold !== false; // Default to true
    const headerItalic = context.tables?.headerStyle?.italic === true;
    const headerUnderline = context.tables?.headerStyle?.underline === true;
    const headerBgColor = context.tables?.headerStyle?.backgroundColor;
    const headerTextColor = context.tables?.headerStyle?.textColor;
    const headerTextAlign = context.tables?.headerStyle?.textAlign || 'left';

    // Get cell style settings
    const cellBold = context.tables?.cellStyle?.bold === true;
    const cellItalic = context.tables?.cellStyle?.italic === true;
    const cellUnderline = context.tables?.cellStyle?.underline === true;
    const cellBgColor = context.tables?.cellStyle?.backgroundColor;
    const cellTextColor = context.tables?.cellStyle?.textColor;
    const cellTextAlign = context.tables?.cellStyle?.textAlign || 'left';

    // Estimate total lines in the table by counting lines in each cell
    let totalLines = 0;
    const estimatedCharsPerLine = 80; // Rough estimate for text wrapping

    rows.forEach(row => {
        (row.children as TElement[]).forEach(cell => {
            const cellContent = serializeNodesToTypst(cell.children, context).trim();
            const isHeader = cell.type === 'th';
            const verticalAlign = (cell as any).verticalAlign as string | undefined;

            // Count lines in this cell: explicit newlines + estimated wrapping
            const explicitLines = (cellContent.match(/\n/g) || []).length + 1;
            // Estimate additional lines from text wrapping (remove newlines for this calculation)
            const textWithoutNewlines = cellContent.replace(/\n/g, ' ');
            const estimatedWrappedLines = Math.max(1, Math.ceil(textWithoutNewlines.length / estimatedCharsPerLine));
            // Use the maximum of explicit lines or estimated wrapped lines
            const cellLines = Math.max(explicitLines, estimatedWrappedLines);
            totalLines += cellLines;

            // Apply text styles based on whether it's a header or regular cell
            let finalContent = cellContent;
            if (isHeader) {
                if (headerBold) finalContent = `*${finalContent}*`;
                if (headerItalic) finalContent = `_${finalContent}_`;
                if (headerUnderline) finalContent = `#underline[${finalContent}]`;
            } else {
                if (cellBold) finalContent = `*${finalContent}*`;
                if (cellItalic) finalContent = `_${finalContent}_`;
                if (cellUnderline) finalContent = `#underline[${finalContent}]`;
            }

            // Apply text color based on cell type
            const textColor = isHeader ? headerTextColor : cellTextColor;
            if (textColor) {
                finalContent = `#text(fill: rgb("${textColor}"))[${finalContent}]`;
            }

            // Build table.cell arguments
            const cellArgs: string[] = [];

            // Set explicit alignment - use textAlign from style settings, or vertical alignment if specified
            // Priority: vertical alignment if specified, otherwise use textAlign from header/cell style
            if (verticalAlign === 'middle') {
                cellArgs.push('align: horizon');
            } else if (verticalAlign === 'bottom') {
                cellArgs.push('align: bottom');
            } else {
                // Use textAlign from header or cell style settings
                const textAlign = isHeader ? headerTextAlign : cellTextAlign;
                cellArgs.push(`align: ${textAlign}`);
            }

            // Add background color based on cell type
            const bgColor = isHeader ? headerBgColor : cellBgColor;
            if (bgColor) {
                cellArgs.push(`fill: rgb("${bgColor}")`);
            }

            // Always use table.cell to ensure explicit alignment is set
            tableContent += `  table.cell(${cellArgs.join(', ')})[${finalContent}],\n`;
        });
    });

    tableContent += `)`;

    // The table needs the # prefix to be a valid Typst expression
    const tableWithPrefix = `#${tableContent}`;

    // For header/footer tables (insideContext=true), always use 100% width and ignore preventPageBreak
    // Also skip alignment wrapping for header/footer tables to ensure they fill width
    // maxWidth and minWidth are already defined above

    // Check if table is too large for a single page - if so, ignore preventPageBreak
    // Also ignore preventPageBreak for header/footer tables
    // Estimate: tables with more than 50 total lines are likely too tall for a single page
    // (assuming ~20-30 lines fit on a typical page with margins)
    const shouldPreventPageBreak = !isHeaderFooter && context.tables?.preventPageBreak && totalLines <= 50;

    // For header/footer tables, return the table directly without alignment wrapping to ensure full width
    if (isHeaderFooter) {
        return `${tableWithPrefix}\n`;
    }

    const alignment = context.tables?.alignment || 'center';
    let finalTable: string;

    // Determine if we need to wrap in a block for preventPageBreak or width constraints
    const tableHasWidthConstraints = (maxWidth > 0 && maxWidth < 100) || minWidth > 0;
    const useBlock = shouldPreventPageBreak || tableHasWidthConstraints;

    if (useBlock) {
        const blockArgs: string[] = [];
        if (shouldPreventPageBreak) blockArgs.push('breakable: false');

        if (tableHasWidthConstraints) {
            // Typst's #block() does not support min-width/max-width arguments.
            // We use 'width'. 
            // If equalWidth is true, we want it to fill the maxWidth.
            // If equalWidth is false (autofit), we'll use maxWidth if content is large, 
            // or minWidth if we want to ensure it's at least that wide.
            // Since we can't do true min-width with auto-growth in Typst yet, 
            // we prioritize maxWidth as the bounding box.
            if (maxWidth > 0 && maxWidth < 100) {
                blockArgs.push(`width: ${maxWidth}%`);
            } else if (minWidth > 0) {
                blockArgs.push(`width: ${minWidth}%`);
            }
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
        // Apply alignment directly to the table
        if (alignment === 'left') {
            finalTable = `#align(left)[${tableWithPrefix}]`;
        } else if (alignment === 'right') {
            finalTable = `#align(right)[${tableWithPrefix}]`;
        } else {
            // center is default
            finalTable = `#align(center)[${tableWithPrefix}]`;
        }
    }

    return `${finalTable}\n`;
}
