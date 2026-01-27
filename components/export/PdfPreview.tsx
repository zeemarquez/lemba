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

// Fast hash function for image data comparison
// Uses sampling to avoid hashing entire image data
function hashImageData(dataUrl: string): string {
    // Sample characters from the data URL for fast comparison
    // The base64 data portion starts after "data:image/webp;base64,"
    const dataStart = dataUrl.indexOf(',') + 1;
    const data = dataUrl.substring(dataStart);
    const len = data.length;
    
    // Sample ~100 characters spread across the data
    let hash = 0;
    const sampleSize = Math.min(100, len);
    const step = Math.max(1, Math.floor(len / sampleSize));
    
    for (let i = 0; i < len; i += step) {
        const char = data.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash;
    }
    
    // Also include length for additional uniqueness
    hash = ((hash << 5) - hash) + len;
    hash = hash & hash;
    
    return hash.toString();
}

interface PdfPreviewProps {
    /** When true, enables landscape detection for horizontal page layout in standalone windows */
    isStandaloneWindow?: boolean;
}

export function PdfPreview({ isStandaloneWindow = false }: PdfPreviewProps) {
    const { activeFileId, files, activeTemplateId, templates, previewQuality } = useStore();
    const [mounted, setMounted] = useState(false);
    const [pageImages, setPageImages] = useState<(string | null)[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [scale, setScale] = useState(0.8);
    const [viewMode, setViewMode] = useState<'zoom' | 'FitH' | 'FitV'>('FitH');
    const [error, setError] = useState<string | null>(null);
    const [isLandscape, setIsLandscape] = useState(false);
    const [renderingProgress, setRenderingProgress] = useState<{ current: number; total: number } | null>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);
    const lastContentHashRef = useRef<string>('');
    const viewportRef = useRef<HTMLDivElement>(null);
    const pdfDocumentRef = useRef<any>(null);
    // Cache stores: pageNum -> { imageDataUrl, imageHash }
    const pageCacheRef = useRef<Map<number, { imageDataUrl: string; imageHash: string }>>(new Map());
    const pageRenderQueueRef = useRef<Set<number>>(new Set());
    const isRenderingRef = useRef(false);
    const totalPagesRef = useRef(0);

    // Detect if window is landscape (wider than tall) for horizontal page layout
    useEffect(() => {
        if (!isStandaloneWindow) {
            setIsLandscape(false);
            return;
        }
        
        const checkLandscape = () => {
            setIsLandscape(window.innerWidth > window.innerHeight);
        };
        
        checkLandscape();
        window.addEventListener('resize', checkLandscape);
        return () => window.removeEventListener('resize', checkLandscape);
    }, [isStandaloneWindow]);

    // Use client-side PDF compiler with Web Worker
    const { compilePdf, cancelCompilation, isInitialized, initError, compilationStage } = usePdfCompiler();

    useEffect(() => {
        const initPdfJs = async () => {
            if (typeof window !== 'undefined' && !pdfjsLib) {
                try {
                    const pdfjs = await import('pdfjs-dist');
                    pdfjsLib = pdfjs;
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
    const renderScaleRef = useRef(2.0);

    // Render a single page and compare with cache
    // Returns { imageDataUrl, changed } where changed indicates if page content differs from cache
    const renderSinglePage = useCallback(async (pdf: any, pageNum: number): Promise<{ imageDataUrl: string; changed: boolean }> => {
        const page = await pdf.getPage(pageNum);
        const renderScale = renderScaleRef.current;
        const viewport = page.getViewport({ scale: renderScale });

        if (pageNum === 1) {
            const baseViewport = page.getViewport({ scale: 1.0 });
            setPageDimensions({ width: baseViewport.width, height: baseViewport.height });
        }

        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');
        if (!context) throw new Error('Cannot get canvas context');

        canvas.height = viewport.height;
        canvas.width = viewport.width;

        await page.render({
            canvasContext: context,
            viewport: viewport,
            canvas: canvas as any
        }).promise;

        const imageDataUrl = canvas.toDataURL('image/webp', 0.9);
        const imageHash = hashImageData(imageDataUrl);
        
        // Check if this page's content has changed from cached version
        const cached = pageCacheRef.current.get(pageNum);
        if (cached && cached.imageHash === imageHash) {
            // Page content hasn't changed - return cached image, mark as unchanged
            return { imageDataUrl: cached.imageDataUrl, changed: false };
        }
        
        // Page content changed - update cache
        pageCacheRef.current.set(pageNum, { imageDataUrl, imageHash });
        return { imageDataUrl, changed: true };
    }, []);

    // Process render queue with yielding to main thread
    const processRenderQueue = useCallback(async (pdf: any, existingImages: (string | null)[]) => {
        if (isRenderingRef.current || pageRenderQueueRef.current.size === 0) return;
        
        isRenderingRef.current = true;
        
        try {
            while (pageRenderQueueRef.current.size > 0) {
                // Get the next page in order
                const sortedPages = Array.from(pageRenderQueueRef.current).sort((a, b) => a - b);
                const nextPage = sortedPages[0];
                
                if (nextPage === undefined) break;
                
                pageRenderQueueRef.current.delete(nextPage);
                
                try {
                    const { imageDataUrl, changed } = await renderSinglePage(pdf, nextPage);
                    
                    // Only update state if page content actually changed
                    if (changed || !existingImages[nextPage - 1]) {
                        setPageImages(prev => {
                            const newImages = [...prev];
                            newImages[nextPage - 1] = imageDataUrl;
                            return newImages;
                        });
                    }
                    
                    setRenderingProgress({ current: totalPagesRef.current - pageRenderQueueRef.current.size, total: totalPagesRef.current });
                    
                    // Yield to main thread to keep UI responsive
                    await new Promise(resolve => setTimeout(resolve, 0));
                } catch (err) {
                    console.error(`Error rendering page ${nextPage}:`, err);
                }
            }
        } finally {
            isRenderingRef.current = false;
            setRenderingProgress(null);
        }
    }, [renderSinglePage]);

    const fitToWidth = useCallback(async () => {
        if (viewportRef.current && pdfDocumentRef.current) {
            setViewMode('FitH');
            const page = await pdfDocumentRef.current.getPage(1);
            const viewportAtScale1 = page.getViewport({ scale: 1.0 });
            const availableWidth = viewportRef.current.clientWidth - 64;
            setScale(availableWidth / viewportAtScale1.width);
        }
    }, []);

    const fitToHeight = useCallback(async () => {
        if (viewportRef.current && pdfDocumentRef.current) {
            setViewMode('FitV');
            const page = await pdfDocumentRef.current.getPage(1);
            const viewportAtScale1 = page.getViewport({ scale: 1.0 });
            const availableHeight = viewportRef.current.clientHeight - 80;
            setScale(availableHeight / viewportAtScale1.height);
        }
    }, []);

    // Fetch and render preview using client-side compilation
    const fetchPreview = useCallback(async () => {
        if (!activeFile || !isInitialized) return;

        const currentHash = getContentHash(content, settings, previewQuality);

        // Skip if content hasn't changed
        if (currentHash === lastContentHashRef.current && pageImages.some(img => img !== null)) {
            return;
        }

        // Cancel any previous compilation
        cancelCompilation();
        
        setIsLoading(true);
        setError(null);
        pageRenderQueueRef.current.clear();

        try {
            // Compile PDF using Web Worker
            const pdfBuffer = await compilePdf({
                markdown: content,
                title: activeFile.name.replace(/\.[^/.]+$/, ""),
                settings: settings,
            });

            // Load PDF with PDF.js
            const loadingTask = pdfjsLib.getDocument({ data: pdfBuffer });
            const pdf = await loadingTask.promise;
            pdfDocumentRef.current = pdf;
            totalPagesRef.current = pdf.numPages;
            lastContentHashRef.current = currentHash;

            // Keep existing page images for comparison (don't reset to nulls)
            // This allows unchanged pages to be reused from cache
            const existingImages = [...pageImages];
            
            // Adjust array size if page count changed
            if (pdf.numPages !== existingImages.length) {
                // If page count changed, we need to resize
                if (pdf.numPages > existingImages.length) {
                    // Add nulls for new pages
                    while (existingImages.length < pdf.numPages) {
                        existingImages.push(null);
                    }
                } else {
                    // Remove extra pages and clear their cache
                    for (let i = pdf.numPages; i < existingImages.length; i++) {
                        pageCacheRef.current.delete(i + 1);
                    }
                    existingImages.length = pdf.numPages;
                }
                setPageImages(existingImages);
            }
            
            // Queue ALL pages for rendering (cache comparison happens during render)
            for (let i = 1; i <= pdf.numPages; i++) {
                pageRenderQueueRef.current.add(i);
            }
            
            // Start rendering with existing images for comparison
            processRenderQueue(pdf, existingImages);

            // Apply fit mode after PDF loads
            if (viewMode === 'FitH') fitToWidth();
            else if (viewMode === 'FitV') fitToHeight();

        } catch (err: any) {
            if (err.message !== 'Compilation cancelled') {
                console.error('Preview error:', err);
                setError(err.message || 'Failed to generate preview');
            }
        } finally {
            setIsLoading(false);
        }
    }, [activeFile, content, settings, previewQuality, getContentHash, pageImages, viewMode, fitToWidth, fitToHeight, compilePdf, cancelCompilation, isInitialized, processRenderQueue]);

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
        if (activeFile && !pageImages.some(img => img !== null) && isInitialized) {
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

    // Listen for navigation events from the outline
    const scrollToHeading = useCallback(async (headingText: string) => {
        if (!pdfDocumentRef.current || !viewportRef.current) return;
        
        const pdf = pdfDocumentRef.current;
        const numPages = pdf.numPages;
        
        let pagesToSkip = 0;
        if (settings?.frontPage?.enabled) {
            pagesToSkip += 1 + (settings.frontPage.emptyPagesAfter || 0);
        }
        if (settings?.outline?.enabled) {
            pagesToSkip += 1 + (settings.outline.emptyPagesAfter || 0);
        }
        
        const startPage = Math.min(pagesToSkip + 1, numPages);
        
        for (let pageNum = startPage; pageNum <= numPages; pageNum++) {
            try {
                const page = await pdf.getPage(pageNum);
                const textContent = await page.getTextContent();
                const pageText = textContent.items
                    .map((item: any) => item.str)
                    .join(' ');
                
                const normalizedPageText = pageText.replace(/\s+/g, ' ').toLowerCase();
                const normalizedHeading = headingText.replace(/\s+/g, ' ').toLowerCase();
                
                if (normalizedPageText.includes(normalizedHeading)) {
                    const pageElements = viewportRef.current?.querySelectorAll('[data-page-index]');
                    if (pageElements && pageElements[pageNum - 1]) {
                        pageElements[pageNum - 1].scrollIntoView({ 
                            behavior: 'smooth', 
                            block: 'start' 
                        });
                    } else {
                        const pageContainer = viewportRef.current?.querySelector('.p-6');
                        if (pageContainer) {
                            const pageHeight = (pageDimensions?.height || 842) * scale + 24 + 20;
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

    // Zoom with scroll position adjustment
    const zoomAtPoint = useCallback((newScale: number, clientX?: number, clientY?: number) => {
        const viewport = viewportRef.current;
        if (!viewport) {
            setScale(newScale);
            return;
        }

        const oldScale = scale;
        const clampedNewScale = Math.max(0.1, Math.min(3.0, newScale));
        
        if (clampedNewScale === oldScale) return;

        const rect = viewport.getBoundingClientRect();
        const pointX = clientX !== undefined ? clientX - rect.left : rect.width / 2;
        const pointY = clientY !== undefined ? clientY - rect.top : rect.height / 2;

        const scrollLeft = viewport.scrollLeft;
        const scrollTop = viewport.scrollTop;

        const contentX = scrollLeft + pointX;
        const contentY = scrollTop + pointY;

        const scaleRatio = clampedNewScale / oldScale;

        const newScrollLeft = contentX * scaleRatio - pointX;
        const newScrollTop = contentY * scaleRatio - pointY;

        setScale(clampedNewScale);
        
        requestAnimationFrame(() => {
            viewport.scrollLeft = Math.max(0, newScrollLeft);
            viewport.scrollTop = Math.max(0, newScrollTop);
        });
    }, [scale]);

    const handleZoomIn = useCallback(() => {
        setViewMode('zoom');
        zoomAtPoint(scale + 0.1);
    }, [scale, zoomAtPoint]);

    const handleZoomOut = useCallback(() => {
        setViewMode('zoom');
        zoomAtPoint(scale - 0.1);
    }, [scale, zoomAtPoint]);

    // Wheel zoom handling
    const lastGestureScale = useRef(1);
    const isHovering = useRef(false);
    const scaleRef = useRef(scale);
    
    useEffect(() => {
        scaleRef.current = scale;
    }, [scale]);

    const handleMouseEnter = useCallback(() => {
        isHovering.current = true;
    }, []);

    const handleMouseLeave = useCallback(() => {
        isHovering.current = false;
    }, []);

    useEffect(() => {
        const handleWheel = (e: WheelEvent) => {
            if (!e.ctrlKey && !e.metaKey) return;
            if (!isHovering.current) return;

            e.preventDefault();

            const viewport = viewportRef.current;
            if (!viewport) return;

            const zoomSensitivity = 0.008;
            const delta = -e.deltaY * zoomSensitivity;
            
            const oldScale = scaleRef.current;
            const newScale = Math.max(0.1, Math.min(3.0, oldScale + delta));
            
            if (newScale === oldScale) return;

            const rect = viewport.getBoundingClientRect();
            const pointX = e.clientX - rect.left;
            const pointY = e.clientY - rect.top;

            const scrollLeft = viewport.scrollLeft;
            const scrollTop = viewport.scrollTop;

            const contentX = scrollLeft + pointX;
            const contentY = scrollTop + pointY;

            const scaleRatio = newScale / oldScale;

            const newScrollLeft = contentX * scaleRatio - pointX;
            const newScrollTop = contentY * scaleRatio - pointY;

            scaleRef.current = newScale;
            setViewMode(prev => prev === 'zoom' ? prev : 'zoom');
            setScale(newScale);

            requestAnimationFrame(() => {
                viewport.scrollLeft = Math.max(0, newScrollLeft);
                viewport.scrollTop = Math.max(0, newScrollTop);
            });
        };

        window.addEventListener('wheel', handleWheel, { passive: false });

        return () => {
            window.removeEventListener('wheel', handleWheel);
        };
    }, []);

    // Safari gesture events
    useEffect(() => {
        const container = containerRef.current;
        if (!container) return;

        const handleGestureStart = (e: Event) => {
            e.preventDefault();
            lastGestureScale.current = 1;
        };

        const handleGestureChange = (e: Event) => {
            e.preventDefault();
            
            const viewport = viewportRef.current;
            if (!viewport) return;
            
            const gestureEvent = e as unknown as { scale: number; clientX: number; clientY: number };
            const delta = gestureEvent.scale / lastGestureScale.current;
            lastGestureScale.current = gestureEvent.scale;
            
            const oldScale = scaleRef.current;
            const newScale = Math.max(0.1, Math.min(3.0, oldScale * delta));
            
            if (newScale === oldScale) return;

            const rect = viewport.getBoundingClientRect();
            const pointX = (gestureEvent.clientX || rect.left + rect.width / 2) - rect.left;
            const pointY = (gestureEvent.clientY || rect.top + rect.height / 2) - rect.top;

            const scrollLeft = viewport.scrollLeft;
            const scrollTop = viewport.scrollTop;

            const contentX = scrollLeft + pointX;
            const contentY = scrollTop + pointY;

            const scaleRatio = newScale / oldScale;

            const newScrollLeft = contentX * scaleRatio - pointX;
            const newScrollTop = contentY * scaleRatio - pointY;

            scaleRef.current = newScale;
            setViewMode(prev => prev === 'zoom' ? prev : 'zoom');
            setScale(newScale);

            requestAnimationFrame(() => {
                viewport.scrollLeft = Math.max(0, newScrollLeft);
                viewport.scrollTop = Math.max(0, newScrollTop);
            });
        };

        const handleGestureEnd = (e: Event) => {
            e.preventDefault();
        };

        container.addEventListener('gesturestart', handleGestureStart, { passive: false });
        container.addEventListener('gesturechange', handleGestureChange, { passive: false });
        container.addEventListener('gestureend', handleGestureEnd, { passive: false });

        return () => {
            container.removeEventListener('gesturestart', handleGestureStart);
            container.removeEventListener('gesturechange', handleGestureChange);
            container.removeEventListener('gestureend', handleGestureEnd);
        };
    }, []);

    // Get stage label for UI
    const getStageLabel = useCallback(() => {
        switch (compilationStage) {
            case 'initializing': return 'Initializing...';
            case 'processing-images': return 'Processing images...';
            case 'compiling': return 'Compiling PDF...';
            default: return 'Generating preview...';
        }
    }, [compilationStage]);

    if (!mounted) {
        return (
            <div className="aspect-[210/297] bg-white dark:bg-zinc-900 border shadow-sm rounded flex items-center justify-center">
                <p className="text-[10px] text-muted-foreground">Loading...</p>
            </div>
        );
    }

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

    const totalPages = pageImages.length;

    return (
        <div className="flex-1 flex flex-col min-h-0 h-full">
            <div
                className="flex-1 flex flex-col overflow-hidden rounded border shadow-lg bg-zinc-100 dark:bg-zinc-950 h-full relative"
                ref={containerRef}
                onMouseEnter={handleMouseEnter}
                onMouseLeave={handleMouseLeave}
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
                        {(isLoading || renderingProgress) && (
                            <div className="flex items-center gap-1 mr-1">
                                <Loader2 size={12} className="animate-spin text-primary" />
                                {renderingProgress && (
                                    <span className="text-[9px] text-muted-foreground">
                                        {renderingProgress.current}/{renderingProgress.total}
                                    </span>
                                )}
                            </div>
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
                    {isLoading && totalPages === 0 && (
                        <div className="absolute inset-0 z-50 flex items-center justify-center bg-background/80">
                            <div className="flex flex-col items-center gap-2">
                                <Loader2 size={24} className="animate-spin text-muted-foreground" />
                                <p className="text-sm text-muted-foreground">{getStageLabel()}</p>
                            </div>
                        </div>
                    )}

                    {/* Error State */}
                    {error && totalPages === 0 && (
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

                    <div 
                        className={cn(
                            "p-6 flex items-center gap-6",
                            isLandscape ? "flex-row min-w-full" : "flex-col min-h-full"
                        )}
                        style={{
                            minWidth: isLandscape 
                                ? undefined 
                                : (pageDimensions ? pageDimensions.width * scale + 48 : 'auto'),
                            minHeight: isLandscape 
                                ? (pageDimensions ? pageDimensions.height * scale + 48 : 'auto')
                                : undefined,
                        }}
                    >
                        {pageImages.map((imageDataUrl, index) => (
                            <div 
                                key={index} 
                                className="flex flex-col items-center shrink-0" 
                                data-page-index={index}
                            >
                                <div
                                    className="shadow-2xl bg-white dark:bg-zinc-100 rounded-sm overflow-hidden border border-zinc-200 dark:border-zinc-800 select-none"
                                    style={{
                                        width: pageDimensions ? pageDimensions.width * scale : 'auto',
                                        height: pageDimensions ? pageDimensions.height * scale : 'auto',
                                        maxWidth: 'none',
                                        willChange: 'width',
                                    }}
                                >
                                    {imageDataUrl ? (
                                        <img
                                            src={imageDataUrl}
                                            alt={`Page ${index + 1}`}
                                            style={{
                                                width: '100%',
                                                height: 'auto',
                                                imageRendering: 'auto',
                                            }}
                                            className="block pointer-events-none"
                                            draggable={false}
                                        />
                                    ) : (
                                        <div className="w-full h-full flex items-center justify-center bg-zinc-50">
                                            <Loader2 size={16} className="animate-spin text-muted-foreground" />
                                        </div>
                                    )}
                                </div>
                                <div className="mt-2 text-[9px] text-muted-foreground font-medium uppercase tracking-widest opacity-50">
                                    Page {index + 1} of {totalPages}
                                </div>
                            </div>
                        ))}

                        {totalPages === 0 && !isLoading && !error && (
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
