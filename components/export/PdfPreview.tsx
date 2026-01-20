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
                            <div key={index} className="flex flex-col items-center">
                                <div
                                    className="shadow-2xl bg-white dark:bg-zinc-100 rounded-sm overflow-hidden border border-zinc-200 dark:border-zinc-800"
                                    style={{
                                        width: pageDimensions ? pageDimensions.width * scale : 'auto',
                                        maxWidth: 'none', // Prevent interference from other styles
                                    }}
                                >
                                    <img
                                        src={imageDataUrl}
                                        alt={`Page ${index + 1}`}
                                        style={{
                                            width: '100%',
                                            height: 'auto',
                                        }}
                                        className="block"
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
