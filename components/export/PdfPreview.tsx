"use client";

import { useStore } from "@/lib/store";
import { useEffect, useState, useRef, useCallback } from "react";
import { ZoomIn, ZoomOut, MoveHorizontal, MoveVertical, Loader2, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { usePdfCompiler } from "@/hooks/use-pdf-compiler";
import { cn } from "@/lib/utils";


// We import PDF.js dynamically to avoid SSR issues
let pdfjsLib: any = null;

// Debounce delay for preview generation (ms) - wait for user to stop typing
const DEBOUNCE_DELAY = 500;

// Interface for text item from PDF.js
interface TextItem {
    str: string;
    transform: number[];
    width: number;
    height: number;
}

export function PdfPreview() {
    const { activeFileId, files, activeTemplateId, templates, previewQuality } = useStore();
    const [mounted, setMounted] = useState(false);
    const [pageImages, setPageImages] = useState<string[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [scale, setScale] = useState(0.8);
    const [viewMode, setViewMode] = useState<'zoom' | 'FitH' | 'FitV'>('FitH');
    const [error, setError] = useState<string | null>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);
    const lastContentHashRef = useRef<string>('');
    const viewportRef = useRef<HTMLDivElement>(null);
    const pdfDocumentRef = useRef<any>(null);

    // Use client-side PDF compiler
    const { compilePdf, isInitialized, initError } = usePdfCompiler();

    useEffect(() => {
        const initPdfJs = async () => {
            if (typeof window !== 'undefined' && !pdfjsLib) {
                try {
                    const pdfjs = await import('pdfjs-dist');
                    // Use the legacy/standard bundle if possible, but dist/build/pdf.mjs is usually fine
                    pdfjsLib = pdfjs;
                    // Version 4.x+ uses .mjs for worker
                    pdfjsLib.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`;
                    setMounted(true);
                } catch (err) {
                    console.error("Failed to load PDF.js", err);
                    setError("Failed to load PDF engine");
                }
            } else if (pdfjsLib) {
                setMounted(true);
            }
        };
        initPdfJs();
    }, []);

    const activeFile = files.find(f => f.id === activeFileId);
    const activeTemplate = templates.find(t => t.id === activeTemplateId);
    const content = activeFile?.content || '';
    const settings = activeTemplate?.settings;

    // Simple hash function for change detection
    const getContentHash = useCallback((content: string, settings: any, quality: string) => {
        const str = content + JSON.stringify(settings || {}) + quality;
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            const char = str.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash;
        }
        return hash.toString();
    }, []);

    const [pageDimensions, setPageDimensions] = useState<{ width: number, height: number } | null>(null);

    const renderPages = useCallback(async (pdf: any, currentScale: number) => {
        const images: string[] = [];
        for (let i = 1; i <= pdf.numPages; i++) {
            const page = await pdf.getPage(i);
            const viewport = page.getViewport({ scale: currentScale * 2 }); // Render at 2x for sharpness

            if (i === 1) {
                const baseViewport = page.getViewport({ scale: 1.0 });
                setPageDimensions({ width: baseViewport.width, height: baseViewport.height });
            }

            const canvas = document.createElement('canvas');
            const context = canvas.getContext('2d');
            if (!context) continue;

            canvas.height = viewport.height;
            canvas.width = viewport.width;

            await page.render({
                canvasContext: context,
                viewport: viewport,
                canvas: canvas as any
            }).promise;

            images.push(canvas.toDataURL('image/webp', 0.8));
        }
        setPageImages(images);
    }, []);

    const fitToWidth = useCallback(async () => {
        if (viewportRef.current && pdfDocumentRef.current) {
            setViewMode('FitH');
            const page = await pdfDocumentRef.current.getPage(1);
            const viewportAtScale1 = page.getViewport({ scale: 1.0 });
            // Use a slightly larger buffer to account for rounding and potential vertical scrollbar
            const availableWidth = viewportRef.current.clientWidth - 64;
            setScale(availableWidth / viewportAtScale1.width);
        }
    }, []);

    const fitToHeight = useCallback(async () => {
        if (viewportRef.current && pdfDocumentRef.current) {
            setViewMode('FitV');
            const page = await pdfDocumentRef.current.getPage(1);
            const viewportAtScale1 = page.getViewport({ scale: 1.0 });
            const availableHeight = viewportRef.current.clientHeight - 80; // p-6 + page labels + buffer
            setScale(availableHeight / viewportAtScale1.height);
        }
    }, []);

    // Fetch and render preview using client-side compilation
    const fetchPreview = useCallback(async () => {
        if (!activeFile || !isInitialized) return;

        const currentHash = getContentHash(content, settings, previewQuality);

        // Skip if content hasn't changed
        if (currentHash === lastContentHashRef.current && pageImages.length > 0) {
            return;
        }

        setIsLoading(true);
        setError(null);

        try {
            // Compile PDF using client-side WASM compiler
            const pdfBuffer = await compilePdf({
                markdown: content,
                title: activeFile.name.replace(/\.[^/.]+$/, ""),
                settings: settings,
            });

            // Load PDF with PDF.js
            const loadingTask = pdfjsLib.getDocument({ data: pdfBuffer });
            const pdf = await loadingTask.promise;
            pdfDocumentRef.current = pdf;

            await renderPages(pdf, scale);
            lastContentHashRef.current = currentHash;

            // Apply fit mode after PDF loads
            if (viewMode === 'FitH') fitToWidth();
            else if (viewMode === 'FitV') fitToHeight();

        } catch (err: any) {
            console.error('Preview error:', err);
            setError(err.message || 'Failed to generate preview');
        } finally {
            setIsLoading(false);
        }
    }, [activeFile, content, settings, previewQuality, getContentHash, pageImages.length, renderPages, scale, viewMode, fitToWidth, fitToHeight, compilePdf, isInitialized]);

    // Update rendering when scale changes (debounced)
    useEffect(() => {
        if (pdfDocumentRef.current && !isLoading) {
            const timer = setTimeout(() => {
                renderPages(pdfDocumentRef.current!, scale);
            }, 300);
            return () => clearTimeout(timer);
        }
    }, [scale, renderPages, isLoading]);

    // Debounced preview generation
    useEffect(() => {
        if (!activeFile || !isInitialized) return;
        if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
        debounceTimerRef.current = setTimeout(() => {
            fetchPreview();
        }, DEBOUNCE_DELAY);
        return () => {
            if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
        };
    }, [content, settings, activeFile, fetchPreview, isInitialized]);

    // Initial load
    useEffect(() => {
        if (activeFile && pageImages.length === 0 && isInitialized) {
            fetchPreview();
        }
    }, [activeFile, isInitialized]);

    useEffect(() => {
        const handleResize = () => {
            if (viewMode === 'FitH') fitToWidth();
            else if (viewMode === 'FitV') fitToHeight();
        };
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, [viewMode, fitToWidth, fitToHeight]);

    // Handle double-click on PDF pages to navigate to source
    const handlePdfDoubleClick = useCallback(async (event: React.MouseEvent<HTMLDivElement>, pageIndex: number) => {
        if (!pdfDocumentRef.current || !content) return;

        // Get click position relative to the page image
        // We need to capture these synchronously before the async operations
        const target = event.currentTarget;
        if (!target) return;
        
        const rect = target.getBoundingClientRect();
        const clickX = event.clientX - rect.left;
        const clickY = event.clientY - rect.top;
        const displayWidth = rect.width;
        const displayHeight = rect.height;

        try {
            const page = await pdfDocumentRef.current.getPage(pageIndex + 1);
            const textContent = await page.getTextContent();
            const viewport = page.getViewport({ scale: 1.0 });

            // Convert click position to PDF coordinates
            // The image is scaled, so we need to adjust
            const scaleX = viewport.width / displayWidth;
            const scaleY = viewport.height / displayHeight;

            const pdfX = clickX * scaleX;
            const pdfY = viewport.height - (clickY * scaleY); // PDF Y is from bottom

            // Find the closest text item to the click position
            let closestItem: { text: string; distance: number } | null = null;
            const textItems = textContent.items as TextItem[];

            for (const item of textItems) {
                if (!item.str || item.str.trim().length === 0) continue;

                // Get item position from transform matrix [a, b, c, d, e, f]
                // e = x position, f = y position
                const itemX = item.transform[4];
                const itemY = item.transform[5];
                const itemWidth = item.width;
                const itemHeight = Math.abs(item.transform[0]) || 12; // Approximate height from font size

                // Check if click is within or near the text item bounds
                const isWithinX = pdfX >= itemX - 5 && pdfX <= itemX + itemWidth + 5;
                const isWithinY = pdfY >= itemY - 5 && pdfY <= itemY + itemHeight + 5;

                if (isWithinX && isWithinY) {
                    // Direct hit
                    closestItem = { text: item.str, distance: 0 };
                    break;
                }

                // Calculate distance for finding closest
                const centerX = itemX + itemWidth / 2;
                const centerY = itemY + itemHeight / 2;
                const distance = Math.sqrt(Math.pow(pdfX - centerX, 2) + Math.pow(pdfY - centerY, 2));

                if (!closestItem || distance < closestItem.distance) {
                    closestItem = { text: item.str, distance };
                }
            }

            if (closestItem && closestItem.distance < 100) {
                // Search for this text in the markdown source
                const searchText = closestItem.text.trim();
                if (searchText.length < 2) return;

                // Find the line in the source that contains this text
                const lines = content.split('\n');
                let foundLine = -1;
                
                // First, try to find an exact match
                for (let i = 0; i < lines.length; i++) {
                    const line = lines[i];
                    // Skip markdown syntax for comparison
                    const cleanLine = line
                        .replace(/^#+\s*/, '') // Remove heading markers
                        .replace(/\*\*|__/g, '') // Remove bold
                        .replace(/\*|_/g, '') // Remove italic
                        .replace(/`/g, '') // Remove code
                        .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1') // Replace links with text
                        .trim();
                    
                    if (cleanLine.includes(searchText) || searchText.includes(cleanLine.substring(0, 20))) {
                        foundLine = i + 1; // 1-based line number
                        break;
                    }
                }

                // If no exact match, try partial matching with normalized whitespace
                if (foundLine === -1) {
                    const normalizedSearch = searchText.replace(/\s+/g, ' ').toLowerCase();
                    for (let i = 0; i < lines.length; i++) {
                        const normalizedLine = lines[i]
                            .replace(/^#+\s*/, '')
                            .replace(/\*\*|__|[*_`]/g, '')
                            .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
                            .replace(/\s+/g, ' ')
                            .toLowerCase()
                            .trim();
                        
                        if (normalizedLine.includes(normalizedSearch) || 
                            (normalizedSearch.length > 5 && normalizedLine.includes(normalizedSearch.substring(0, 15)))) {
                            foundLine = i + 1;
                            break;
                        }
                    }
                }

                if (foundLine > 0) {
                    // Dispatch navigation event to the editor
                    const event = new CustomEvent('navigate-to-line', {
                        detail: { 
                            line: foundLine,
                            headingText: searchText // Also pass the text for WYSIWYG mode
                        }
                    });
                    window.dispatchEvent(event);
                }
            }
        } catch (err) {
            console.error('Error handling PDF double-click:', err);
        }
    }, [content]);

    // Listen for navigation events from the outline and scroll to the corresponding page
    const scrollToHeading = useCallback(async (headingText: string) => {
        if (!pdfDocumentRef.current || !viewportRef.current) return;
        
        const pdf = pdfDocumentRef.current;
        const numPages = pdf.numPages;
        
        // Calculate pages to skip (front page, TOC, and their empty pages after)
        let pagesToSkip = 0;
        if (settings?.frontPage?.enabled) {
            pagesToSkip += 1 + (settings.frontPage.emptyPagesAfter || 0);
        }
        if (settings?.outline?.enabled) {
            // TOC typically takes 1 page, but could be more - we'll skip at least 1
            // plus any empty pages configured after it
            pagesToSkip += 1 + (settings.outline.emptyPagesAfter || 0);
        }
        
        // Start searching after the front matter pages
        const startPage = Math.min(pagesToSkip + 1, numPages);
        
        // Search through each page for the heading text (starting after TOC)
        for (let pageNum = startPage; pageNum <= numPages; pageNum++) {
            try {
                const page = await pdf.getPage(pageNum);
                const textContent = await page.getTextContent();
                const pageText = textContent.items
                    .map((item: any) => item.str)
                    .join(' ');
                
                // Check if this page contains the heading text
                // We normalize whitespace and do a case-insensitive search
                const normalizedPageText = pageText.replace(/\s+/g, ' ').toLowerCase();
                const normalizedHeading = headingText.replace(/\s+/g, ' ').toLowerCase();
                
                if (normalizedPageText.includes(normalizedHeading)) {
                    // Found the page! Scroll to it
                    const pageElements = viewportRef.current?.querySelectorAll('[data-page-index]');
                    if (pageElements && pageElements[pageNum - 1]) {
                        pageElements[pageNum - 1].scrollIntoView({ 
                            behavior: 'smooth', 
                            block: 'start' 
                        });
                    } else {
                        // Fallback: calculate approximate scroll position
                        const pageContainer = viewportRef.current?.querySelector('.p-6');
                        if (pageContainer) {
                            const pageHeight = (pageDimensions?.height || 842) * scale + 24 + 20; // page + gap + label
                            const scrollTop = (pageNum - 1) * pageHeight;
                            viewportRef.current?.scrollTo({ 
                                top: scrollTop, 
                                behavior: 'smooth' 
                            });
                        }
                    }
                    return;
                }
            } catch (err) {
                console.error(`Error searching page ${pageNum}:`, err);
            }
        }
    }, [pageDimensions, scale, settings]);

    useEffect(() => {
        const handleNavigateToLine = (event: CustomEvent<{ headingText?: string }>) => {
            if (event.detail.headingText) {
                scrollToHeading(event.detail.headingText);
            }
        };
        
        window.addEventListener('navigate-to-line', handleNavigateToLine as EventListener);
        return () => {
            window.removeEventListener('navigate-to-line', handleNavigateToLine as EventListener);
        };
    }, [scrollToHeading]);

    const handleZoomIn = () => {
        setViewMode('zoom');
        setScale(prev => Math.min(prev + 0.1, 3.0));
    };

    const handleZoomOut = () => {
        setViewMode('zoom');
        setScale(prev => Math.max(prev - 0.1, 0.1));
    };

    if (!mounted) {
        return (
            <div className="aspect-[210/297] bg-white dark:bg-zinc-900 border shadow-sm rounded flex items-center justify-center">
                <p className="text-[10px] text-muted-foreground">Loading...</p>
            </div>
        );
    }

    // Show initialization error if compiler failed to load
    if (initError) {
        return (
            <div className="aspect-[210/297] bg-white dark:bg-zinc-900 border shadow-sm rounded flex items-center justify-center p-4">
                <div className="flex flex-col items-center gap-2 text-center">
                    <AlertCircle size={24} className="text-destructive" />
                    <p className="text-sm font-medium text-destructive">Failed to load PDF compiler</p>
                    <p className="text-xs text-muted-foreground">{initError}</p>
                </div>
            </div>
        );
    }

    // Show loading while compiler initializes
    if (!isInitialized) {
        return (
            <div className="aspect-[210/297] bg-white dark:bg-zinc-900 border shadow-sm rounded flex items-center justify-center">
                <div className="flex flex-col items-center gap-2">
                    <Loader2 size={20} className="animate-spin text-muted-foreground" />
                    <p className="text-[10px] text-muted-foreground">Initializing PDF compiler...</p>
                </div>
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
            <div
                className="flex-1 flex flex-col overflow-hidden rounded border shadow-lg bg-zinc-100 dark:bg-zinc-950 h-full relative"
                ref={containerRef}
            >
                {/* Top Bar */}
                <div className="flex items-center justify-between px-2 py-1 bg-background border-b shrink-0 z-20">
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

                    <div className="flex items-center gap-1">
                        {isLoading && (
                            <Loader2 size={12} className="animate-spin text-primary mr-1" />
                        )}
                        <Button variant="ghost" size="icon" className={cn("h-6 w-6", viewMode === 'FitH' && "bg-accent")} onClick={fitToWidth} title="Fit to Width">
                            <MoveHorizontal size={14} />
                        </Button>
                        <Button variant="ghost" size="icon" className={cn("h-6 w-6", viewMode === 'FitV' && "bg-accent")} onClick={fitToHeight} title="Fit to Height">
                            <MoveVertical size={14} />
                        </Button>
                    </div>
                </div>

                <div className="flex-1 h-full min-h-0 overflow-auto relative" ref={viewportRef}>
                    {/* Initial Loading */}
                    {isLoading && pageImages.length === 0 && (
                        <div className="absolute inset-0 z-50 flex items-center justify-center bg-background/80">
                            <div className="flex flex-col items-center gap-2">
                                <Loader2 size={24} className="animate-spin text-muted-foreground" />
                                <p className="text-sm text-muted-foreground">Generating preview...</p>
                            </div>
                        </div>
                    )}

                    {/* Error State */}
                    {error && pageImages.length === 0 && (
                        <div className="absolute inset-0 z-50 flex items-center justify-center bg-background/80">
                            <div className="flex flex-col items-center gap-2 p-4 text-center">
                                <p className="text-sm text-destructive">Preview Error</p>
                                <p className="text-xs text-muted-foreground">{error}</p>
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={fetchPreview}
                                    className="mt-2"
                                >
                                    Retry
                                </Button>
                            </div>
                        </div>
                    )}

                    <div className="p-6 flex flex-col items-center min-h-full gap-6">
                        {pageImages.map((imageDataUrl, index) => (
                            <div key={index} className="flex flex-col items-center" data-page-index={index}>
                                <div
                                    className="shadow-2xl bg-white dark:bg-zinc-100 rounded-sm overflow-hidden border border-zinc-200 dark:border-zinc-800 cursor-pointer select-none"
                                    style={{
                                        width: pageDimensions ? pageDimensions.width * scale : 'auto',
                                        maxWidth: 'none', // Prevent interference from other styles
                                    }}
                                    onDoubleClick={(e) => handlePdfDoubleClick(e, index)}
                                    title="Double-click to navigate to this section in the editor"
                                >
                                    <img
                                        src={imageDataUrl}
                                        alt={`Page ${index + 1}`}
                                        style={{
                                            width: '100%',
                                            height: 'auto',
                                        }}
                                        className="block pointer-events-none"
                                        draggable={false}
                                    />
                                </div>
                                <div className="mt-2 text-[9px] text-muted-foreground font-medium uppercase tracking-widest opacity-50">
                                    Page {index + 1} of {pageImages.length}
                                </div>
                            </div>
                        ))}

                        {pageImages.length === 0 && !isLoading && !error && (
                            <div className="flex-1 flex items-center justify-center py-20">
                                <p className="text-xs text-muted-foreground">Preview will appear here</p>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
