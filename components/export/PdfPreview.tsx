"use client";

import { useStore } from "@/lib/store";
import { useEffect, useState, useMemo, useRef } from "react";
import { ZoomIn, ZoomOut, MoveHorizontal, MoveVertical } from "lucide-react";
import { Button } from "@/components/ui/button";
import { serializeNodesToHtml, processHtmlImageCaptions } from "@/lib/plate/serialize-html";
import { Marked } from 'marked';
import markedKatex from "marked-katex-extension";
import { markedHighlight } from "marked-highlight";
import hljs from 'highlight.js';

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

// A4 dimensions in mm: 210 x 297
// At 96 DPI, 1mm ≈ 3.78px
// A4 at 96 DPI: ~794px x 1123px
const A4_WIDTH_PX = 210 * 3.78;
const A4_HEIGHT_PX = 297 * 3.78;

// Convert markdown to HTML using marked
function markdownToHtml(markdown: string): string {
    if (!markdown) return '';
    try {
        const markedInstance = createMarkedInstance();
        const html = markedInstance.parse(markdown) as string;
        // Process image captions that were passed as attributes
        return processHtmlImageCaptions(html);
    } catch (e) {
        console.error("Error parsing markdown:", e);
        return markdown;
    }
}

// Convert header/footer content to HTML
// Supports both JSON (Plate Value) and legacy markdown formats
function headerFooterToHtml(content: string, context: { pageNumber?: number; date?: string; title?: string }): string {
    if (!content) return '';
    
    // Try JSON first (new format with alignment preserved)
    try {
        const parsed = JSON.parse(content);
        if (Array.isArray(parsed) && parsed.length > 0) {
            return serializeNodesToHtml(parsed, context);
        }
    } catch {
        // Not JSON, try markdown
    }
    
    // Fallback to markdown conversion (legacy format)
    let html = markdownToHtml(content);
    
    // Replace placeholders in markdown HTML too
    if (context.pageNumber !== undefined) html = html.replace(/{page}/g, String(context.pageNumber));
    if (context.date) html = html.replace(/{date}/g, context.date);
    if (context.title) html = html.replace(/{title}/g, context.title);
    
    return html;
}

// Generate preview CSS that exactly matches the PDF export CSS
// This is a client-side version of the generatePdfCss function from the API route
function generatePreviewCss(settings: any, previewId: string, pageWidth: number, pageHeight: number): string {
    const margins = settings?.margins || { top: '20mm', bottom: '20mm', left: '20mm', right: '20mm' };
    const headerMargins = settings?.header?.margins || { top: '0mm', bottom: '0mm', left: '0mm', right: '0mm' };
    const footerMargins = settings?.footer?.margins || { top: '0mm', bottom: '0mm', left: '0mm', right: '0mm' };
    
    // Use scoped selectors to avoid conflicts with page styles
    const scope = `#${previewId}`;
    
    const generateHeadingCss = (level: string, style: any) => {
        if (!style) return '';
        return `
        ${scope} .prose ${level} { 
            font-size: ${style.fontSize} !important; 
            color: ${style.color} !important; 
            text-align: ${style.textAlign} !important;
            border-bottom: ${style.borderBottom ? '1px solid ' + style.color : 'none'} !important;
            text-transform: ${style.textTransform} !important;
            font-weight: ${style.fontWeight || '600'} !important;
            text-decoration: ${style.textDecoration || 'none'} !important;
            margin-top: 1.5em !important;
            margin-bottom: 0.5em !important;
        }
        `;
    };

    const numberingCss = (() => {
        const levels = ['h1', 'h2', 'h3', 'h4', 'h5', 'h6'];
        let css = `#pdf-preview-wrapper { counter-reset: h1-counter; }\n`;
        
        // Add resets
        levels.forEach((level, index) => {
            if (index < levels.length - 1) {
                const nextLevel = levels[index + 1];
                css += `${scope} .prose ${level} { counter-reset: ${nextLevel}-counter; }\n`;
            }
        });

        // Add counters
        levels.forEach((level, index) => {
            const levelSettings = (settings as any)?.[level]?.numbering;
            if (!levelSettings?.enabled) return;

            let contentString = `"${levelSettings.prefix}"`;
            
            // Build the hierarchy string
            for (let i = 0; i <= index; i++) {
                const currentLevel = levels[i];
                const currentSettings = (settings as any)?.[currentLevel]?.numbering;
                
                if (currentSettings?.enabled) {
                    contentString += ` counter(${currentLevel}-counter, ${currentSettings.style})`;
                    
                    // Add separator if it's not the last enabled item
                    let hasMoreEnabled = false;
                    for (let j = i + 1; j <= index; j++) {
                        if ((settings as any)?.[levels[j]]?.numbering?.enabled) {
                            hasMoreEnabled = true;
                            break;
                        }
                    }

                    if (hasMoreEnabled) {
                        contentString += ` "${currentSettings.separator}"`;
                    }
                }
            }
            
            contentString += ` "${levelSettings.suffix}"`;

            css += `
            ${scope} .prose ${level}::before { 
                counter-increment: ${level}-counter !important; 
                content: ${contentString} !important; 
                margin-right: 0.5em !important;
            }\n`;
        });

        return css;
    })();
    
    return `
        ${scope} *, ${scope} *::before, ${scope} *::after {
            box-sizing: border-box;
        }
        ${scope} {
            width: ${pageWidth}px !important;
            height: ${pageHeight}px !important;
            font-family: ${settings?.fontFamily || "'Inter', sans-serif"};
            font-size: ${settings?.fontSize || '16px'};
            line-height: 1.6;
            color: ${settings?.textColor || '#333'};
            background-color: ${settings?.backgroundColor || '#ffffff'};
            position: relative;
            overflow: hidden;
        }
        ${scope} .page-container {
            width: ${pageWidth}px;
            height: ${pageHeight}px;
            display: flex;
            flex-direction: column;
            padding-top: ${margins.top};
            padding-right: ${margins.right};
            padding-bottom: ${margins.bottom};
            padding-left: ${margins.left};
            box-sizing: border-box;
        }
        ${scope} .prose {
            font-family: ${settings?.fontFamily || "'Inter', sans-serif"};
            font-size: ${settings?.fontSize || '16px'};
            color: ${settings?.textColor || '#333'};
            max-width: 100%;
            flex: 1;
            line-height: 1.6;
        }
        ${scope} .page-header, ${scope} .page-footer {
            flex-shrink: 0;
            width: 100%;
        }
        ${scope} .page-header {
            padding-top: ${headerMargins.top};
            padding-right: ${headerMargins.right};
            padding-bottom: ${headerMargins.bottom};
            padding-left: ${headerMargins.left};
            margin-bottom: 10px;
        }
        ${scope} .page-footer {
            padding-top: ${footerMargins.top};
            padding-right: ${footerMargins.right};
            padding-bottom: ${footerMargins.bottom};
            padding-left: ${footerMargins.left};
            margin-top: 10px;
        }
        ${scope} .page-header p, ${scope} .page-footer p {
            margin: 0;
        }
        ${scope} .page-header h1, ${scope} .page-header h2, ${scope} .page-header h3,
        ${scope} .page-footer h1, ${scope} .page-footer h2, ${scope} .page-footer h3 {
            margin: 0;
        }
        ${scope} .page-header table, ${scope} .page-footer table {
            border-collapse: collapse;
            width: 100%;
        }
        ${scope} .page-header th, ${scope} .page-footer th,
        ${scope} .page-header td, ${scope} .page-footer td {
            padding: 8px;
            text-align: left;
        }
        ${scope} .page-header th, ${scope} .page-footer th {
            background-color: #f4f4f4;
        }
        ${scope} .page-number-placeholder::after {
            content: "1";
        }
        ${scope} .page-number-placeholder[data-format="lower-roman"]::after { content: "i"; }
        ${scope} .page-number-placeholder[data-format="upper-roman"]::after { content: "I"; }
        ${scope} .page-number-placeholder[data-format="lower-alpha"]::after { content: "a"; }
        ${scope} .page-number-placeholder[data-format="upper-alpha"]::after { content: "A"; }
        ${generateHeadingCss('h1', settings?.h1)}
        ${generateHeadingCss('h2', settings?.h2)}
        ${generateHeadingCss('h3', settings?.h3)}
        ${generateHeadingCss('h4', settings?.h4)}
        ${generateHeadingCss('h5', settings?.h5)}
        ${generateHeadingCss('h6', settings?.h6)}
        ${numberingCss}
        ${scope} .prose p { margin: 1em 0; }
        ${scope} .prose code {
            background: #f4f4f4;
            padding: 0.2em 0.4em;
            border-radius: 3px;
            font-family: 'JetBrains Mono', monospace;
            font-size: 0.9em;
        }
        ${scope} .prose pre {
            background: #f4f4f4;
            padding: 1em;
            border-radius: 5px;
            overflow-x: auto;
        }
        ${scope} .prose pre code {
            background: none;
            padding: 0;
        }
        ${scope} .prose blockquote {
            border-left: 4px solid #ddd;
            margin: 1em 0;
            padding-left: 1em;
            color: #666;
        }
        ${scope} .prose ul, ${scope} .prose ol {
            margin: 1em 0;
            padding-left: 2em;
        }
        ${scope} .prose li { margin: 0.5em 0; }
        ${scope} .prose table {
            border-collapse: collapse;
            width: 100%;
            margin: 1em 0;
        }
        ${scope} .prose th, ${scope} .prose td {
            border: 1px solid #ddd;
            padding: 0.5em;
            text-align: left;
        }
        ${scope} .prose th {
            background: #f4f4f4;
        }
        ${scope} .prose img {
            max-width: 100%;
            height: auto;
        }
        ${scope} .prose a {
            color: #0066cc;
            text-decoration: none;
        }
        ${scope} .prose hr {
            border: none;
            border-top: 1px solid #ddd;
            margin: 2em 0;
        }
        ${scope} .prose strong { font-weight: 600; }
        ${settings?.watermark ? `
        ${scope}::before {
            content: '${settings.watermark}';
            position: absolute;
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

export function PdfPreview() {
    const { activeFileId, files, activeTemplateId, templates } = useStore();
    const [mounted, setMounted] = useState(false);
    const [scale, setScale] = useState(0.35);
    const [pages, setPages] = useState<string[]>([]);
    const [isPaginating, setIsPaginating] = useState(false);
    const previewId = "pdf-preview-page";
    const containerRef = useRef<HTMLDivElement>(null);
    const hiddenContainerRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        setMounted(true);
    }, []);

    // Trackpad pinch-to-zoom support
    useEffect(() => {
        const container = containerRef.current;
        if (!container) return;

        const handleWheel = (e: WheelEvent) => {
            if (e.ctrlKey) {
                e.preventDefault();
                e.stopPropagation();
                
                // deltaY is negative when pinching out (zooming in)
                const delta = -e.deltaY;
                
                setScale(prev => {
                    // Use multiplicative zoom for a smoother, more natural feel
                    const factor = 1 + delta / 300;
                    const newScale = prev * factor;
                    
                    // Allow zooming from 10% to 300%
                    return Math.min(Math.max(newScale, 0.1), 3.0);
                });
            }
        };

        container.addEventListener('wheel', handleWheel, { passive: false });
        return () => container.removeEventListener('wheel', handleWheel);
    }, []);

    const activeFile = files.find(f => f.id === activeFileId);
    const activeTemplate = templates.find(t => t.id === activeTemplateId);
    const content = activeFile?.content || '';
    const settings = activeTemplate?.settings;

    // Convert markdown to HTML
    const htmlContent = useMemo(() => markdownToHtml(content), [content]);

    const isHorizontal = settings?.pageLayout === 'horizontal';
    const currentWidth = isHorizontal ? A4_HEIGHT_PX : A4_WIDTH_PX;
    const currentHeight = isHorizontal ? A4_WIDTH_PX : A4_HEIGHT_PX;

    // Check for page number offset
    const headerOffsetMatch = settings?.header?.content?.match(/"offset":\s*(\d+)/);
    const footerOffsetMatch = settings?.footer?.content?.match(/"offset":\s*(\d+)/);
    const offset = headerOffsetMatch ? parseInt(headerOffsetMatch[1]) : (footerOffsetMatch ? parseInt(footerOffsetMatch[1]) : 0);

    const getPreviewPageNumber = (pageIndex: number, format?: string) => {
        const num = pageIndex + 1 + offset;
        if (format === 'lower-roman') return 'i'; // Simplified
        if (format === 'upper-roman') return 'I';
        if (format === 'lower-alpha') return 'a';
        if (format === 'upper-alpha') return 'A';
        return String(num);
    };

    // Generate the preview CSS that matches PDF export exactly
    const previewCss = useMemo(() => generatePreviewCss(settings, previewId, currentWidth, currentHeight), [settings, previewId, currentWidth, currentHeight]);

    // Track heading counts for continuous numbering across pages
    const [pageHeadingCounts, setPageHeadingCounts] = useState<Record<string, number>[]>([]);

    // Pagination Effect
    useEffect(() => {
        if (!hiddenContainerRef.current || !htmlContent) return;

        setIsPaginating(true);

        // Allow a small delay for DOM to settle/styles to apply
        const timer = setTimeout(() => {
            const container = hiddenContainerRef.current;
            if (!container) return;

            // 1. Setup hidden container structure to match real page
            const pageContainer = container.querySelector('.page-container') as HTMLElement;
            const headerElement = container.querySelector('.page-header') as HTMLElement;
            const footerElement = container.querySelector('.page-footer') as HTMLElement;
            const proseElement = container.querySelector('.prose') as HTMLElement;

            if (!pageContainer || !proseElement) {
                setIsPaginating(false);
                return;
            }

            // 2. Measure available space
            const pageHeight = currentHeight;
            const computedStyle = window.getComputedStyle(pageContainer);
            const paddingTop = parseFloat(computedStyle.paddingTop);
            const paddingBottom = parseFloat(computedStyle.paddingBottom);
            
            const headerHeight = headerElement ? headerElement.offsetHeight : 0;
            const footerHeight = footerElement ? footerElement.offsetHeight : 0;
            
            const headerStyle = headerElement ? window.getComputedStyle(headerElement) : null;
            const footerStyle = footerElement ? window.getComputedStyle(footerElement) : null;
            
            const headerMarginBottom = headerStyle ? parseFloat(headerStyle.marginBottom) : 0;
            const footerMarginTop = footerStyle ? parseFloat(footerStyle.marginTop) : 0;

            const contentAvailableHeight = pageHeight - paddingTop - paddingBottom - headerHeight - headerMarginBottom - footerHeight - footerMarginTop;

            // 3. Iterate through content and split into pages
            proseElement.innerHTML = htmlContent;
            
            const childNodes = Array.from(proseElement.children);
            const newPages: string[] = [];
            const newPageHeadingCounts: Record<string, number>[] = [];
            
            let currentPageNodes: Element[] = [];
            let accumulatedHeight = 0;
            
            const counters = { h1: 0, h2: 0, h3: 0, h4: 0, h5: 0, h6: 0 };
            
            // Capture state for the FIRST page
            newPageHeadingCounts.push({ ...counters });

            childNodes.forEach((node) => {
                const element = node as HTMLElement;
                const tagName = element.tagName.toLowerCase();
                const isHeading = ['h1', 'h2', 'h3', 'h4', 'h5', 'h6'].includes(tagName);
                
                // Calculate height FIRST to decide if it fits
                const height = element.offsetHeight;
                const style = window.getComputedStyle(element);
                const marginTop = parseFloat(style.marginTop);
                const marginBottom = parseFloat(style.marginBottom);
                const elementTotalHeight = height + marginTop + marginBottom;

                if (accumulatedHeight + elementTotalHeight > contentAvailableHeight) {
                    // Page full
                    if (currentPageNodes.length > 0) {
                        newPages.push(currentPageNodes.map(n => n.outerHTML).join(''));
                        currentPageNodes = [];
                        accumulatedHeight = 0;
                        
                        // New page starting.
                        // The current node will be the first on the next page.
                        // We must snapshot the counters AS THEY ARE NOW (before processing this node)
                        // This snapshot will be used to initialize the NEW page.
                        newPageHeadingCounts.push({ ...counters });
                    }
                }
                
                // Process the node (update counters if it's a heading)
                // Note: We do this AFTER deciding page break, so if it moves to next page,
                // the counters for that page are initialized with PRE-node state,
                // and then the node increments them inside the page (via CSS or subsequent logic).
                // Wait, if we use CSS counter-reset on page wrapper, it sets the BASE.
                // If we set base=0. First H1 increments to 1.
                // If we have H1(1) on Page 1.
                // Page 2 starts. Base should be 1.
                // Next H1 increments to 2.
                // Correct.
                
                if (isHeading) {
                    const level = tagName as keyof typeof counters;
                    const levelSettings = (settings as any)?.[level]?.numbering;
                    
                    if (levelSettings?.enabled) {
                        counters[level]++;
                    }
                    
                    const levelNum = parseInt(level[1]);
                    for (let i = levelNum + 1; i <= 6; i++) {
                        counters[`h${i}` as keyof typeof counters] = 0;
                    }
                }

                currentPageNodes.push(element);
                accumulatedHeight += elementTotalHeight;
            });

            // Add last page
            if (currentPageNodes.length > 0) {
                newPages.push(currentPageNodes.map(n => n.outerHTML).join(''));
            }

            // If empty (no content), show at least one page
            if (newPages.length === 0) {
                newPages.push('');
                newPageHeadingCounts.push({ ...counters });
            }

            setPages(newPages);
            setPageHeadingCounts(newPageHeadingCounts);
            setIsPaginating(false);
            
            // Clean up
            proseElement.innerHTML = ''; 
        }, 100);

        return () => clearTimeout(timer);
    }, [htmlContent, settings, currentHeight, activeFile, activeTemplate]);

    const handleZoomIn = () => setScale(prev => Math.min(prev + 0.1, 3.0));
    const handleZoomOut = () => setScale(prev => Math.max(prev - 0.1, 0.1));
    
    const fitToWidth = () => {
        if (containerRef.current) {
            const viewport = containerRef.current.querySelector('.overflow-auto');
            if (viewport) {
                const availableWidth = viewport.clientWidth - 32; // p-4 = 16px * 2
                setScale(availableWidth / currentWidth);
            }
        }
    };

    const fitToHeight = () => {
        if (containerRef.current) {
            const viewport = containerRef.current.querySelector('.overflow-auto');
            if (viewport) {
                const availableHeight = viewport.clientHeight - 32; // p-4 = 16px * 2
                setScale(availableHeight / currentHeight);
            } else {
                setScale(380 / currentHeight);
            }
        }
    };

    if (!mounted) {
        return (
            <div className="aspect-[210/297] bg-white dark:bg-zinc-900 border shadow-sm rounded flex items-center justify-center">
                <p className="text-[10px] text-muted-foreground">Loading...</p>
            </div>
        );
    }

    if (!activeFile) {
        return (
            <div className="aspect-[210/297] bg-white dark:bg-zinc-900 border shadow-sm rounded flex items-center justify-center p-4">
                <p className="text-[10px] text-muted-foreground text-center">
                    Select a file to preview
                </p>
            </div>
        );
    }

    return (
        <div className="flex-1 flex flex-col min-h-0 h-full">
            {/* Preview Container with Top Bar */}
            <div
                className="flex-1 flex flex-col overflow-hidden rounded border shadow-lg bg-muted/50 h-full"
                ref={containerRef}
            >
                {/* Minimal Top Bar */}
                <div className="flex items-center justify-between px-2 py-1 bg-background border-b shrink-0">
                    <div className="flex items-center gap-0.5">
                        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={handleZoomOut} title="Zoom Out">
                            <ZoomOut size={14} />
                        </Button>
                        <span className="text-[10px] font-medium w-9 text-center">
                            {Math.round(scale * 100)}%
                        </span>
                        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={handleZoomIn} title="Zoom In">
                            <ZoomIn size={14} />
                        </Button>
                    </div>
                    
                    <div className="flex items-center gap-0.5">
                        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={fitToWidth} title="Fit to Width">
                            <MoveHorizontal size={14} />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={fitToHeight} title="Fit to Height">
                            <MoveVertical size={14} />
                        </Button>
                    </div>
                </div>

                <div className="flex-1 h-full min-h-0 overflow-auto relative">
                    {/* Loading Overlay */}
                    {isPaginating && (
                        <div className="absolute inset-0 z-50 flex items-center justify-center bg-background/50 backdrop-blur-sm">
                            <p className="text-sm text-muted-foreground">Calculating pages...</p>
                        </div>
                    )}
                    
                    <div id="pdf-preview-wrapper" className="p-4 flex flex-col items-center min-w-max min-h-full">
                        {/* Inject the preview CSS */}
                        <style dangerouslySetInnerHTML={{ __html: previewCss }} />
                        {/* Inject KaTeX CSS */}
                        <link 
                            rel="stylesheet" 
                            href="https://cdn.jsdelivr.net/npm/katex@0.16.27/dist/katex.min.css" 
                            integrity="sha384-n8MVd4Xs03H9kw0ud964uPAkFE909BaZyTTj1jfieI4749zJonathanSVW1+quiTp" 
                            crossOrigin="anonymous" 
                        />
                        {/* Inject Highlight.js CSS */}
                        <link
                            rel="stylesheet"
                            href={`https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/styles/${settings?.codeBlockTheme || 'github'}.min.css`}
                        />
                        
                        {/* Render Pages */}
                        {pages.map((pageContent, index) => {
                            const pageHeaderHtml = settings?.header?.enabled && settings?.header?.content 
                                ? headerFooterToHtml(settings.header.content, { 
                                    pageNumber: parseInt(getPreviewPageNumber(index)), 
                                    date: new Date().toLocaleDateString(),
                                    title: activeFile?.name 
                                  })
                                : '';
                            const pageFooterHtml = settings?.footer?.enabled && settings?.footer?.content
                                ? headerFooterToHtml(settings.footer.content, {
                                    pageNumber: parseInt(getPreviewPageNumber(index)),
                                    date: new Date().toLocaleDateString(),
                                    title: activeFile?.name 
                                  })
                                : '';

                            return (
                                <div key={index} className="flex flex-col items-center">
                                    {/* Wrapper to contain the scaled page */}
                                    <div
                                        style={{
                                            width: Math.ceil(currentWidth * scale),
                                            height: Math.ceil(currentHeight * scale),
                                            overflow: 'hidden',
                                            transition: 'all 0.2s ease-out',
                                            marginBottom: index < pages.length - 1 ? 0 : 0
                                        }}
                                    >
                                        <div
                                            id={previewId}
                                            className="shadow-2xl bg-white"
                                            style={{
                                                transform: `scale(${scale})`,
                                                transformOrigin: 'top left',
                                            }}
                                        >
                                            <div 
                                                className="page-container"
                                                style={{
                                                    // Apply continuous numbering overrides if available
                                                    // Note: We use CSS variables or direct counter-reset style
                                                    // CSS counter-reset syntax: "name value name value..."
                                                    counterReset: pageHeadingCounts[index] 
                                                        ? `h1-counter ${pageHeadingCounts[index].h1} h2-counter ${pageHeadingCounts[index].h2} h3-counter ${pageHeadingCounts[index].h3} h4-counter ${pageHeadingCounts[index].h4} h5-counter ${pageHeadingCounts[index].h5} h6-counter ${pageHeadingCounts[index].h6}`
                                                        : undefined
                                                }}
                                            >
                                                {/* Header */}
                                                {pageHeaderHtml && (
                                                    <div
                                                        className="page-header"
                                                        dangerouslySetInnerHTML={{ __html: pageHeaderHtml }}
                                                    />
                                                )}

                                                {/* Main Content */}
                                                <div
                                                    className="prose"
                                                    style={{ overflow: 'hidden' }}
                                                    dangerouslySetInnerHTML={{ __html: pageContent }}
                                                />

                                                {/* Footer */}
                                                {pageFooterHtml && (
                                                    <div
                                                        className="page-footer"
                                                        dangerouslySetInnerHTML={{ __html: pageFooterHtml }}
                                                    />
                                                )}
                                            </div>
                                        </div>
                                    </div>

                                    {/* Page break indicator (between pages) */}
                                    {index < pages.length - 1 && (
                                        <div className="flex items-center justify-center gap-2 py-8 w-full">
                                            <div className="h-px flex-1 bg-border border-dashed" />
                                            <span className="text-[8px] text-muted-foreground uppercase tracking-wider font-medium">
                                                Page Break
                                            </span>
                                            <div className="h-px flex-1 bg-border border-dashed" />
                                        </div>
                                    )}
                                </div>
                            );
                        })}

                        {/* Hidden Container for measurement */}
                        <div 
                            ref={hiddenContainerRef} 
                            id={previewId} 
                            style={{ 
                                position: 'absolute', 
                                top: -9999, 
                                left: -9999, 
                                visibility: 'hidden',
                                pointerEvents: 'none'
                            }}
                        >
                            <div className="page-container">
                                <div 
                                    className="page-header" 
                                    dangerouslySetInnerHTML={{
                                        __html: settings?.header?.enabled ? headerFooterToHtml(settings?.header?.content || '', {}) : ''
                                    }} 
                                />
                                <div className="prose"></div>
                                <div 
                                    className="page-footer" 
                                    dangerouslySetInnerHTML={{
                                        __html: settings?.footer?.enabled ? headerFooterToHtml(settings?.footer?.content || '', {}) : ''
                                    }} 
                                />
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
