import puppeteer from 'puppeteer';
import { Marked } from 'marked';
import markedKatex from "marked-katex-extension";
import { markedHighlight } from "marked-highlight";
import hljs from 'highlight.js';
import { NextResponse } from 'next/server';
import { serializeNodesToHtml, processHtmlImageCaptions } from '@/lib/plate/serialize-html';

// Create a configured marked instance for reliable math rendering
function createMarkedInstance() {
    const instance = new Marked();
    
    // Add KaTeX extension first
    instance.use(markedKatex({
        throwOnError: false,
        output: 'html',
        nonStandard: true, // Allow single $ for inline math
    }));
    
    // Add highlight extension
    instance.use(markedHighlight({
        emptyLangClass: 'hljs',
        langPrefix: 'hljs language-',
        highlight(code, lang) {
            const language = hljs.getLanguage(lang) ? lang : 'plaintext';
            return hljs.highlight(code, { language }).value;
        }
    }));
    
    return instance;
}

const markedInstance = createMarkedInstance();

// Convert header/footer content to HTML
// Supports both JSON (Plate Value) and legacy markdown formats
async function headerFooterToHtml(content: string, context: { title?: string }): Promise<string> {
    if (!content) return '';
    
    // Try JSON first (new format with alignment preserved)
    try {
        const parsed = JSON.parse(content);
        if (Array.isArray(parsed) && parsed.length > 0) {
            return serializeNodesToHtml(parsed, { title: context.title });
        }
    } catch {
        // Not JSON, try markdown
    }
    
    // Fallback to markdown conversion (legacy format)
    let html = markedInstance.parse(content) as string;
    
    // Replace title and date in markdown (page is handled by CSS)
    if (context.title) html = html.replace(/{title}/g, context.title);
    html = html.replace(/{date}/g, new Date().toLocaleDateString());
    
    return html;
}

// Generate CSS for heading numbering using CSS counters
function generateNumberingCss(settings: any): string {
    const levels = ['h1', 'h2', 'h3', 'h4', 'h5', 'h6'];
    let css = `body { counter-reset: h1-counter h2-counter h3-counter h4-counter h5-counter h6-counter; }\n`;
    
    // Add counter resets for child levels
    levels.forEach((level, index) => {
        if (index < levels.length - 1) {
            const resetLevels = levels.slice(index + 1).map(l => `${l}-counter`).join(' ');
            css += `.prose ${level} { counter-reset: ${resetLevels}; }\n`;
        }
    });

    // Add counter increments and content for each level
    levels.forEach((level, index) => {
        const levelSettings = settings?.[level]?.numbering;
        if (!levelSettings?.enabled) return;

        let contentParts: string[] = [];
        
        // Add prefix
        if (levelSettings.prefix) {
            contentParts.push(`"${levelSettings.prefix}"`);
        }
        
        // Build the hierarchy string with counters
        for (let i = 0; i <= index; i++) {
            const currentLevel = levels[i];
            const currentSettings = settings?.[currentLevel]?.numbering;
            
            if (currentSettings?.enabled) {
                contentParts.push(`counter(${currentLevel}-counter, ${currentSettings.style})`);
                
                // Add separator if there are more enabled levels after this one
                let hasMoreEnabled = false;
                for (let j = i + 1; j <= index; j++) {
                    if (settings?.[levels[j]]?.numbering?.enabled) {
                        hasMoreEnabled = true;
                        break;
                    }
                }
                
                if (hasMoreEnabled && currentSettings.separator) {
                    contentParts.push(`"${currentSettings.separator}"`);
                }
            }
        }
        
        // Add suffix
        if (levelSettings.suffix) {
            contentParts.push(`"${levelSettings.suffix} "`);
        } else {
            contentParts.push(`" "`);
        }

        css += `
        .prose ${level} { counter-increment: ${level}-counter; }
        .prose ${level}::before { 
            content: ${contentParts.join(' ')}; 
        }\n`;
    });

    return css;
}

// Shared function to generate PDF-specific CSS from settings
// This is the single source of truth for PDF styling
export function generatePdfCss(settings: any): string {
    const headerMargins = settings?.header?.margins || { top: '0mm', bottom: '0mm', left: '0mm', right: '0mm' };
    const footerMargins = settings?.footer?.margins || { top: '0mm', bottom: '0mm', left: '0mm', right: '0mm' };
    
    // Generate heading numbering CSS
    const numberingCss = generateNumberingCss(settings);
    
    // Note: Page margins are handled by Puppeteer's margin option, not CSS
    // This ensures consistent margins on ALL pages
    
    return `
        *, *::before, *::after {
            box-sizing: border-box;
        }
        html, body {
            margin: 0;
            padding: 0;
            width: 100%;
        }
        body {
            font-family: ${settings?.fontFamily || "'Inter', sans-serif"};
            font-size: ${settings?.fontSize || '16px'};
            line-height: 1.6;
            color: ${settings?.textColor || '#333'};
            max-width: 100%;
            background-color: ${settings?.backgroundColor || '#ffffff'};
        }
        .prose {
            font-family: ${settings?.fontFamily || "'Inter', sans-serif"};
            font-size: ${settings?.fontSize || '16px'};
            color: ${settings?.textColor || '#333'};
            max-width: 100%;
            line-height: 1.6;
        }
        .page-header, .page-footer {
            width: 100%;
        }
        .page-header {
            padding-top: ${headerMargins.top};
            padding-right: ${headerMargins.right};
            padding-bottom: ${headerMargins.bottom};
            padding-left: ${headerMargins.left};
            margin-bottom: 10px;
        }
        .page-footer {
            padding-top: ${footerMargins.top};
            padding-right: ${footerMargins.right};
            padding-bottom: ${footerMargins.bottom};
            padding-left: ${footerMargins.left};
            margin-top: 10px;
        }
        .page-header p, .page-footer p {
            margin: 0;
        }
        .page-header h1, .page-header h2, .page-header h3,
        .page-footer h1, .page-footer h2, .page-footer h3 {
            margin: 0;
        }
        .page-header table, .page-footer table {
            border-collapse: collapse;
            width: 100%;
        }
        .page-header th, .page-footer th,
        .page-header td, .page-footer td {
            padding: 8px;
            text-align: left;
        }
        .page-header th, .page-footer th {
            background-color: #f4f4f4;
        }
        .page-number-placeholder::after {
            content: counter(page, decimal);
        }
        .page-number-placeholder[data-format="lower-roman"]::after { content: counter(page, lower-roman); }
        .page-number-placeholder[data-format="upper-roman"]::after { content: counter(page, upper-roman); }
        .page-number-placeholder[data-format="lower-alpha"]::after { content: counter(page, lower-alpha); }
        .page-number-placeholder[data-format="upper-alpha"]::after { content: counter(page, upper-alpha); }
        .prose h1, .prose h2, .prose h3, .prose h4, .prose h5, .prose h6 {
            margin-top: 1.5em;
            margin-bottom: 0.5em;
            font-weight: 600;
        }
        .prose h1 { 
            font-size: ${settings?.h1?.fontSize || '2.5em'}; 
            color: ${settings?.h1?.color || 'inherit'}; 
            text-align: ${settings?.h1?.textAlign || 'left'};
            border-bottom: ${settings?.h1?.borderBottom ? '1px solid ' + (settings?.h1?.color || '#000') : 'none'};
            text-transform: ${settings?.h1?.textTransform || 'none'};
        }
        .prose h2 { 
            font-size: ${settings?.h2?.fontSize || '2em'}; 
            color: ${settings?.h2?.color || 'inherit'}; 
            text-align: ${settings?.h2?.textAlign || 'left'};
            border-bottom: ${settings?.h2?.borderBottom ? '1px solid ' + (settings?.h2?.color || '#000') : 'none'};
            text-transform: ${settings?.h2?.textTransform || 'none'};
        }
        .prose h3 { font-size: 1.5em; }
        .prose p { margin: 1em 0; }
        .prose code {
            background: #f4f4f4;
            padding: 0.2em 0.4em;
            border-radius: 3px;
            font-family: 'JetBrains Mono', monospace;
            font-size: 0.9em;
        }
        .prose pre {
            background: #f4f4f4;
            padding: 1em;
            border-radius: 5px;
            overflow-x: auto;
        }
        .prose pre code {
            background: none;
            padding: 0;
        }
        .prose blockquote {
            border-left: 4px solid #ddd;
            margin: 1em 0;
            padding-left: 1em;
            color: #666;
        }
        .prose ul, .prose ol {
            margin: 1em 0;
            padding-left: 2em;
        }
        .prose li { margin: 0.5em 0; }
        .prose table {
            border-collapse: collapse;
            width: 100%;
            margin: 1em 0;
        }
        .prose th, .prose td {
            border: 1px solid #ddd;
            padding: 0.5em;
            text-align: left;
        }
        .prose th {
            background: #f4f4f4;
        }
        .prose img {
            max-width: 100%;
            height: auto;
        }
        .prose a {
            color: #0066cc;
            text-decoration: none;
        }
        .prose hr {
            border: none;
            border-top: 1px solid #ddd;
            margin: 2em 0;
        }
        /* Manual page break styling */
        .manual-page-break {
            page-break-after: always;
            break-after: page;
            height: 0;
            margin: 0;
            padding: 0;
        }
        /* Heading numbering */
        ${numberingCss}
        ${settings?.watermark ? `
        body::before {
            content: '${settings.watermark}';
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%) rotate(-45deg);
            font-size: 5rem;
            color: rgba(0,0,0,0.05);
            pointer-events: none;
            white-space: nowrap;
            z-index: 9999;
        }
        ` : ''}
    `;
}

export async function POST(req: Request) {
    let browser = null;

    try {
        const { markdown, title, css, settings } = await req.json();

        // Convert markdown to HTML using marked
        let htmlContent = markedInstance.parse(markdown || '') as string;
        // Process image captions
        htmlContent = processHtmlImageCaptions(htmlContent);
        // Process page break comments - convert <!-- pagebreak --> to proper page break div
        htmlContent = htmlContent.replace(
            /<!--\s*pagebreak\s*-->/gi,
            '<div class="manual-page-break"></div>'
        );

        // Convert header/footer content to HTML (supports JSON and markdown)
        const headerContent = settings?.header?.enabled && settings?.header?.content
            ? await headerFooterToHtml(settings.header.content, { title })
            : '';
        const footerContent = settings?.footer?.enabled && settings?.footer?.content
            ? await headerFooterToHtml(settings.footer.content, { title })
            : '';

        // Build header HTML (styles are in CSS block)
        const headerHtml = headerContent ? `
            <div class="page-header">
                ${headerContent}
            </div>
        ` : '';

        // Build footer HTML (styles are in CSS block)
        const footerHtml = footerContent ? `
            <div class="page-footer">
                ${footerContent}
            </div>
        ` : '';

        // Generate the PDF CSS from settings (single source of truth)
        let pdfCss = generatePdfCss(settings);

        // Check for page number offset in header/footer content
        const headerMatch = settings?.header?.content?.match(/"offset":\s*(\d+)/);
        const footerMatch = settings?.footer?.content?.match(/"offset":\s*(\d+)/);
        const offset = headerMatch ? parseInt(headerMatch[1]) : (footerMatch ? parseInt(footerMatch[1]) : 0);
        
        if (offset > 0) {
            pdfCss += `\nbody { counter-reset: page ${offset}; }`;
        }

        // Get margins from settings
        const margins = settings?.margins || { top: '20mm', bottom: '20mm', left: '20mm', right: '20mm' };

        // Build the full HTML document - simpler structure since margins are handled by Puppeteer
        const fullHtml = `
            <!DOCTYPE html>
            <html>
            <head>
                <meta charset="utf-8">
                <link rel="preconnect" href="https://fonts.googleapis.com">
                <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
                <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400..700&family=JetBrains+Mono:wght@400..700&family=Outfit:wght@400..700&family=Times+New+Roman&display=swap" rel="stylesheet">
                <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/katex@0.16.27/dist/katex.min.css" crossorigin="anonymous">
                <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/styles/${settings?.codeBlockTheme || 'github'}.min.css">
                <style>
                    ${pdfCss}
                </style>
            </head>
            <body>
                ${headerHtml}
                <div class="prose">
                    ${htmlContent}
                </div>
                ${footerHtml}
            </body>
            </html>
        `;

        // Launch puppeteer
        browser = await puppeteer.launch({
            headless: true,
            args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu', '--disable-dev-shm-usage'],
        });

        const page = await browser.newPage();

        // Set the HTML content
        await page.setContent(fullHtml, { waitUntil: 'networkidle0' });

        // Generate PDF with margins from settings - this ensures consistent margins on ALL pages
        const pdfBuffer = await page.pdf({
            format: 'A4',
            landscape: settings?.pageLayout === 'horizontal',
            margin: {
                top: margins.top,
                right: margins.right,
                bottom: margins.bottom,
                left: margins.left,
            },
            printBackground: true,
        });

        await browser.close();
        browser = null;

        return new Response(pdfBuffer as any, {
            headers: {
                'Content-Type': 'application/pdf',
                'Content-Disposition': 'attachment; filename="export.pdf"',
            },
        });
    } catch (error: any) {
        console.error('PDF generation error:', error);
        if (browser) {
            await browser.close();
        }
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
