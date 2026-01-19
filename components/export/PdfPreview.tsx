"use client";

import { useStore } from "@/lib/store";
import { useEffect, useState, useRef, useCallback } from "react";
import { ZoomIn, ZoomOut, MoveHorizontal, MoveVertical, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { convertIndexedDbImagesToBase64 } from "@/hooks/use-indexed-db-image";

// A4 dimensions for scaling calculations (at 72 DPI for PDF)
// These match the PDF.js render dimensions at scale 1.0
const A4_WIDTH_PX = 595; // 210mm at 72 DPI
const A4_HEIGHT_PX = 842; // 297mm at 72 DPI

// Debounce delay for preview generation (ms) - wait for user to stop typing
const DEBOUNCE_DELAY = 2000;

export function PdfPreview() {
    const { activeFileId, files, activeTemplateId, templates } = useStore();
    const [mounted, setMounted] = useState(false);
    const [scale, setScale] = useState(0.35);
    const [pageImages, setPageImages] = useState<string[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);
    const lastContentHashRef = useRef<string>('');

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
                
                const delta = -e.deltaY;
                
                setScale(prev => {
                    const factor = 1 + delta / 300;
                    const newScale = prev * factor;
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

    const isHorizontal = settings?.pageLayout === 'horizontal';
    const currentWidth = isHorizontal ? A4_HEIGHT_PX : A4_WIDTH_PX;
    const currentHeight = isHorizontal ? A4_WIDTH_PX : A4_HEIGHT_PX;

    // Simple hash function for change detection
    const getContentHash = useCallback((content: string, settings: any) => {
        const str = content + JSON.stringify(settings || {});
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            const char = str.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash;
        }
        return hash.toString();
    }, []);

    // Fetch preview from server
    const fetchPreview = useCallback(async () => {
        if (!activeFile) return;

        const currentHash = getContentHash(content, settings);
        
        // Skip if content hasn't changed
        if (currentHash === lastContentHashRef.current && pageImages.length > 0) {
            return;
        }

        setIsLoading(true);
        setError(null);

        try {
            // Convert IndexedDB images to base64 for server-side rendering
            const markdownWithBase64Images = await convertIndexedDbImagesToBase64(content);

            // Also convert IndexedDB images in header/footer content
            let settingsWithBase64 = settings;
            if (settingsWithBase64) {
                settingsWithBase64 = { ...settingsWithBase64 };
                if (settingsWithBase64.header?.content) {
                    settingsWithBase64.header = {
                        ...settingsWithBase64.header,
                        content: await convertIndexedDbImagesToBase64(settingsWithBase64.header.content),
                    };
                }
                if (settingsWithBase64.footer?.content) {
                    settingsWithBase64.footer = {
                        ...settingsWithBase64.footer,
                        content: await convertIndexedDbImagesToBase64(settingsWithBase64.footer.content),
                    };
                }
            }

            const response = await fetch('/api/preview-pdf', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    markdown: markdownWithBase64Images,
                    title: activeFile.name.replace(/\.[^/.]+$/, ""),
                    settings: settingsWithBase64,
                }),
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || 'Failed to generate preview');
            }

            const data = await response.json();
            setPageImages(data.pages || []);
            lastContentHashRef.current = currentHash;
        } catch (err: any) {
            console.error('Preview error:', err);
            setError(err.message || 'Failed to generate preview');
        } finally {
            setIsLoading(false);
        }
    }, [activeFile, content, settings, getContentHash, pageImages.length]);

    // Debounced preview generation
    useEffect(() => {
        if (!activeFile) return;

        // Clear existing timer
        if (debounceTimerRef.current) {
            clearTimeout(debounceTimerRef.current);
        }

        // Set new timer
        debounceTimerRef.current = setTimeout(() => {
            fetchPreview();
        }, DEBOUNCE_DELAY);

        return () => {
            if (debounceTimerRef.current) {
                clearTimeout(debounceTimerRef.current);
            }
        };
    }, [content, settings, activeFile, fetchPreview]);

    // Initial load
    useEffect(() => {
        if (activeFile && pageImages.length === 0) {
            fetchPreview();
        }
    }, [activeFile]);

    const handleZoomIn = () => setScale(prev => Math.min(prev + 0.1, 3.0));
    const handleZoomOut = () => setScale(prev => Math.max(prev - 0.1, 0.1));
    
    const fitToWidth = () => {
        if (containerRef.current) {
            const viewport = containerRef.current.querySelector('.overflow-auto');
            if (viewport) {
                const availableWidth = viewport.clientWidth - 32;
                setScale(availableWidth / currentWidth);
            }
        }
    };

    const fitToHeight = () => {
        if (containerRef.current) {
            const viewport = containerRef.current.querySelector('.overflow-auto');
            if (viewport) {
                const availableHeight = viewport.clientHeight - 32;
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
            <div
                className="flex-1 flex flex-col overflow-hidden rounded border shadow-lg bg-muted/50 h-full"
                ref={containerRef}
            >
                {/* Top Bar */}
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
                    
                    <div className="flex items-center gap-1">
                        {isLoading && (
                            <Loader2 size={12} className="animate-spin text-muted-foreground" />
                        )}
                        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={fitToWidth} title="Fit to Width">
                            <MoveHorizontal size={14} />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={fitToHeight} title="Fit to Height">
                            <MoveVertical size={14} />
                        </Button>
                    </div>
                </div>

                <div className="flex-1 h-full min-h-0 overflow-auto relative">
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
                    
                    <div className="p-4 flex flex-col items-center min-w-max min-h-full gap-4">
                        {/* Render Page Images */}
                        {pageImages.map((imageDataUrl, index) => (
                            <div key={index} className="flex flex-col items-center">
                                <div
                                    style={{
                                        width: Math.ceil(currentWidth * scale),
                                        height: Math.ceil(currentHeight * scale),
                                        overflow: 'hidden',
                                        transition: 'all 0.2s ease-out',
                                    }}
                                    className="shadow-2xl bg-white rounded-sm"
                                >
                                    <img
                                        src={imageDataUrl}
                                        alt={`Page ${index + 1}`}
                                        style={{
                                            width: currentWidth * scale,
                                            height: currentHeight * scale,
                                            objectFit: 'contain',
                                        }}
                                        draggable={false}
                                    />
                                </div>

                                {/* Page break indicator */}
                                {index < pageImages.length - 1 && (
                                    <div className="flex items-center justify-center gap-2 py-4 w-full">
                                        <div className="h-px flex-1 bg-border" />
                                        <span className="text-[8px] text-muted-foreground uppercase tracking-wider font-medium">
                                            Page {index + 1} / {pageImages.length}
                                        </span>
                                        <div className="h-px flex-1 bg-border" />
                                    </div>
                                )}
                            </div>
                        ))}

                        {/* Empty state placeholder */}
                        {pageImages.length === 0 && !isLoading && !error && (
                            <div 
                                className="bg-white shadow-2xl rounded-sm flex items-center justify-center"
                                style={{
                                    width: Math.ceil(currentWidth * scale),
                                    height: Math.ceil(currentHeight * scale),
                                }}
                            >
                                <p className="text-xs text-muted-foreground">
                                    Preview will appear here
                                </p>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
