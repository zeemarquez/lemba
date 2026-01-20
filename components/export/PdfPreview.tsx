"use client";

import { useStore } from "@/lib/store";
import { useEffect, useState, useRef, useCallback } from "react";
import { ZoomIn, ZoomOut, MoveHorizontal, MoveVertical, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { convertIndexedDbImagesToBase64 } from "@/hooks/use-indexed-db-image";
import { cn } from "@/lib/utils";


// Debounce delay for preview generation (ms) - wait for user to stop typing
const DEBOUNCE_DELAY = 500;

export function PdfPreview() {
    const { activeFileId, files, activeTemplateId, templates, previewQuality } = useStore();
    const [mounted, setMounted] = useState(false);
    const [pdfUrl, setPdfUrl] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [scale, setScale] = useState(1.0);
    const [viewMode, setViewMode] = useState<'zoom' | 'Fit' | 'FitH' | 'FitV'>('FitH');
    const [error, setError] = useState<string | null>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);
    const lastContentHashRef = useRef<string>('');

    useEffect(() => {
        setMounted(true);
        return () => {
            if (pdfUrl) URL.revokeObjectURL(pdfUrl);
        }
    }, [pdfUrl]);

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

    // Fetch preview from server
    const fetchPreview = useCallback(async () => {
        if (!activeFile) return;

        const currentHash = getContentHash(content, settings, previewQuality);

        // Skip if content hasn't changed
        if (currentHash === lastContentHashRef.current) {
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
                    quality: previewQuality,
                }),
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || 'Failed to generate preview');
            }

            const blob = await response.blob();
            const url = URL.createObjectURL(blob);

            // Clean up old URL
            if (pdfUrl) URL.revokeObjectURL(pdfUrl);

            setPdfUrl(url);
            lastContentHashRef.current = currentHash;
        } catch (err: any) {
            console.error('Preview error:', err);
            setError(err.message || 'Failed to generate preview');
        } finally {
            setIsLoading(false);
        }
    }, [activeFile, content, settings, previewQuality, getContentHash, pdfUrl]);

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
        if (activeFile && !pdfUrl) {
            fetchPreview();
        }
    }, [activeFile]);

    const handleZoomIn = () => {
        setViewMode('zoom');
        setScale(prev => Math.min(prev + 0.1, 3.0));
    };

    const handleZoomOut = () => {
        setViewMode('zoom');
        setScale(prev => Math.max(prev - 0.1, 0.1));
    };

    const fitToWidth = () => setViewMode('FitH');
    const fitToHeight = () => setViewMode('FitV');

    const getPdfParams = () => {
        const base = "#toolbar=0&navpanes=0&statusbar=0&messages=0&scrollbar=1";
        if (viewMode === 'zoom') {
            return `${base}&zoom=${Math.round(scale * 100)}`;
        }
        return `${base}&view=${viewMode}`;
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
                className="flex-1 flex flex-col overflow-hidden rounded border shadow-lg bg-muted/50 h-full relative"
                ref={containerRef}
            >
                {/* Top Bar */}
                <div className="flex items-center justify-between px-2 py-1 bg-background border-b shrink-0 z-20">
                    <div className="flex items-center gap-0.5">
                        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={handleZoomOut} title="Zoom Out">
                            <ZoomOut size={14} />
                        </Button>
                        <span className="text-[10px] font-medium w-9 text-center">
                            {viewMode === 'zoom' ? `${Math.round(scale * 100)}%` : 'Auto'}
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

                {/* Initial Loading */}
                {isLoading && !pdfUrl && (
                    <div className="absolute inset-0 z-50 flex items-center justify-center bg-background/80">
                        <div className="flex flex-col items-center gap-2">
                            <Loader2 size={24} className="animate-spin text-muted-foreground" />
                            <p className="text-sm text-muted-foreground">Generating preview...</p>
                        </div>
                    </div>
                )}

                {/* Error State */}
                {error && !pdfUrl && (
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

                {pdfUrl ? (
                    <iframe
                        src={`${pdfUrl}${getPdfParams()}`}
                        key={`${pdfUrl}-${viewMode}-${scale}`}
                        className="flex-1 w-full border-none bg-zinc-100 dark:bg-zinc-800"
                        title="PDF Preview"
                    />
                ) : (
                    !isLoading && !error && (
                        <div className="flex-1 flex items-center justify-center">
                            <p className="text-xs text-muted-foreground">Preview will appear here</p>
                        </div>
                    )
                )}
            </div>
        </div>
    );
}
