import type { Descendant, TElement, TText } from 'platejs';
import { fixTypstUnit } from './client-compiler';

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
    let text = escapeTypst(node.text || '');

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
                const figureCall = `#figure(${imgCall}, caption: [${escapeTypst(formattedCaption)}], supplement: none)`;
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
        content = escapeTypst(context.title || '');
    } else if (placeholderType === 'variable') {
        const variableName = (element as any).variableName;
        const variableValue = context.variables?.[variableName] || '';
        content = escapeTypst(variableValue);
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

    // Determine column sizing based on equalWidthColumns setting
    // When equalWidthColumns is false (default), use 'auto' to auto-size based on content
    // When equalWidthColumns is true, use '1fr' for equal width columns
    // For header/footer tables (insideContext=true), always use '1fr' to fill width
    const isHeaderFooter = context.insideContext === true;
    const equalWidth = isHeaderFooter || context.tables?.equalWidthColumns === true;
    const columns = equalWidth 
        ? `(${'1fr, '.repeat(maxCols).slice(0, -2)})`
        : `(${'auto, '.repeat(maxCols).slice(0, -2)})`;

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
    const maxWidth = isHeaderFooter ? 100 : (context.tables?.maxWidth ?? 100);
    
    // Check if table is too large for a single page - if so, ignore preventPageBreak
    // Also ignore preventPageBreak for header/footer tables
    // Estimate: tables with more than 50 total lines are likely too tall for a single page
    // (assuming ~20-30 lines fit on a typical page with margins)
    const shouldPreventPageBreak = !isHeaderFooter && context.tables?.preventPageBreak && totalLines <= 50;
    
    // For header/footer tables, return the table directly without alignment wrapping to ensure full width
    if (isHeaderFooter) {
        return `${tableWithPrefix}\n`;
    }
    
    // Apply alignment if specified - cells now have explicit alignment set, so table alignment won't affect them
    const alignment = context.tables?.alignment || 'center';
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
    
    return `${finalTable}\n`;
}
