'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { markdownToTypst } from '@/lib/typst/markdown-to-typst';
import { serializeNodesToTypst } from '@/lib/typst/serialize-nodes';
import {
    compileTypstToPdf as compileTypstToPdfMainThread,
    generatePreamble,
    initializeCompiler,
    resetCompiler,
    setCustomFonts,
    FontData,
    TypstOptions,
    getEnabledHeadingLevels
} from '@/lib/typst/client-compiler';
import { processTypstImages } from '@/lib/typst/client-image-manager';
import { convertIndexedDbImagesToBase64 } from '@/hooks/use-indexed-db-image';
import { useStore } from '@/lib/store';
import { parseVariablesFromFrontmatter } from '@/components/export/ExportSidebar';
import type {
    WorkerRequest,
    WorkerResponse,
    FontDataTransfer
} from '@/lib/typst/typst-worker';

// Heading numbering settings
interface HeadingNumbering {
    enabled?: boolean;
    style?: 'decimal' | 'decimal-leading-zero' | 'lower-roman' | 'upper-roman' | 'lower-alpha' | 'upper-alpha';
    separator?: string;
    prefix?: string;
    suffix?: string;
}

// Heading style settings
interface HeadingSettings {
    fontSize?: string;
    color?: string;
    textAlign?: string;
    borderBottom?: boolean;
    numbering?: HeadingNumbering;
}

// Settings type that matches the template settings from the store
export interface TemplateSettings {
    fontFamily?: string;
    fontSize?: string;
    textColor?: string;
    backgroundColor?: string;
    pageLayout?: 'vertical' | 'horizontal';
    pageSize?: {
        preset?: string;
        custom?: {
            width: string;
            height: string;
        };
    };
    margins?: { top: string; bottom: string; left: string; right: string };
    startPageNumber?: number;
    h1?: HeadingSettings;
    h2?: HeadingSettings;
    h3?: HeadingSettings;
    h4?: HeadingSettings;
    h5?: HeadingSettings;
    h6?: HeadingSettings;
    header?: { enabled?: boolean; content?: string; startPage?: number; margins?: { bottom: string; left: string; right: string } };
    footer?: { enabled?: boolean; content?: string; startPage?: number; margins?: { top: string; left: string; right: string } };
    frontPage?: { enabled?: boolean; content?: string; emptyPagesAfter?: number };
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
    outline?: {
        enabled?: boolean;
        title?: {
            content?: string;
        };
        entries?: {
            fontSize?: string;
            bold?: boolean;
            italic?: boolean;
            underline?: boolean;
            filler?: 'dotted' | 'line' | 'empty';
        };
        emptyPagesAfter?: number;
    };
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
    codeBlocks?: {
        showLanguage?: boolean;
        showLineNumbers?: boolean;
        backgroundColor?: string;
        borderColor?: string;
        borderWidth?: string;
    };
    alerts?: {
        showHeader: boolean;
    };
    [key: string]: unknown;
}

export interface CompileOptions {
    markdown: string;
    title?: string;
    settings?: TemplateSettings;
}

export interface UsePdfCompilerReturn {
    compilePdf: (options: CompileOptions) => Promise<ArrayBuffer>;
    cancelCompilation: () => void;
    isCompiling: boolean;
    error: string | null;
    isInitialized: boolean;
    initError: string | null;
    compilationStage: 'idle' | 'initializing' | 'compiling' | 'processing-images';
}

/**
 * Convert Plate/markdown content to Typst
 */
async function contentToTypst(content: string, context: { 
    title?: string; 
    scaleImages?: boolean; 
    insideContext?: boolean; 
    tables?: { preventPageBreak?: boolean; equalWidthColumns?: boolean; alignment?: 'left' | 'center' | 'right' }; 
    pageNumberOffset?: number; 
    variables?: Record<string, string>; 
    figures?: { captionEnabled?: boolean; captionFormat?: string }; 
    alerts?: { showHeader: boolean } 
}): Promise<string> {
    if (!content) return '';

    try {
        const parsed = JSON.parse(content);
        if (Array.isArray(parsed) && parsed.length > 0) {
            return serializeNodesToTypst(parsed, {
                title: context.title,
                scaleImages: context.scaleImages,
                insideContext: context.insideContext,
                tables: context.tables,
                pageNumberOffset: context.pageNumberOffset,
                variables: context.variables,
                figures: context.figures,
                alerts: context.alerts
            });
        }
    } catch {
        // Not JSON, assume markdown string
    }

    return markdownToTypst(content, { figures: context.figures, alerts: context.alerts }).trim();
}

/**
 * Convert Blob to Uint8Array
 */
async function blobToUint8Array(blob: Blob): Promise<Uint8Array> {
    const arrayBuffer = await blob.arrayBuffer();
    return new Uint8Array(arrayBuffer);
}

/**
 * Generate unique ID for requests
 */
function generateId(): string {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Build Typst source from options (shared between worker and main thread)
 */
async function buildTypstSource(options: CompileOptions): Promise<string> {
    const { markdown, title, settings } = options;

    // Pre-process images (needs DOM/IndexedDB)
    const markdownWithImages = await convertIndexedDbImagesToBase64(markdown || '');
    const variables = parseVariablesFromFrontmatter(markdownWithImages);
    const typstBody = markdownToTypst(markdownWithImages, {
        tables: settings?.tables,
        figures: settings?.figures,
        alerts: settings?.alerts
    });

    // Prepare Header/Footer/Front Page
    let headerContent = '';
    let footerContent = '';
    let frontPageContent = '';

    const startPageNumber = settings?.startPageNumber || 1;
    const pageNumberOffset = 1 - startPageNumber;

    if (settings?.header?.enabled && settings?.header?.content) {
        const headerWithImages = await convertIndexedDbImagesToBase64(settings.header.content);
        headerContent = await contentToTypst(headerWithImages, { title, scaleImages: true, insideContext: true, pageNumberOffset, variables, alerts: settings?.alerts });
    }

    if (settings?.footer?.enabled && settings?.footer?.content) {
        const footerWithImages = await convertIndexedDbImagesToBase64(settings.footer.content);
        footerContent = await contentToTypst(footerWithImages, { title, scaleImages: true, insideContext: true, pageNumberOffset, variables, alerts: settings?.alerts });
    }

    if (settings?.frontPage?.enabled && settings?.frontPage?.content) {
        const frontPageWithImages = await convertIndexedDbImagesToBase64(settings.frontPage.content);
        frontPageContent = await contentToTypst(frontPageWithImages, { title, scaleImages: false, insideContext: false, tables: settings?.tables, pageNumberOffset, variables, figures: settings?.figures, alerts: settings?.alerts });
    }

    // Generate Preamble
    const typstOptions: TypstOptions = {
        ...settings,
        header: headerContent,
        headerMargins: settings?.header?.margins,
        headerStartPage: settings?.header?.startPage || 1,
        footer: footerContent,
        footerMargins: settings?.footer?.margins,
        footerStartPage: settings?.footer?.startPage || 1,
        fontFamily: settings?.fontFamily || 'Inter',
        frontPage: frontPageContent,
    };

    const preamble = generatePreamble(typstOptions);

    // Build body content
    let bodyContent = typstBody;

    // Build outline section if enabled
    let outlineContent = '';
    if (settings?.outline?.enabled) {
        const outlineSettings = settings.outline;
        const entriesSettings = outlineSettings.entries || {};
        const entriesFontSize = entriesSettings.fontSize || '12px';
        const entriesBold = entriesSettings.bold || false;
        const entriesItalic = entriesSettings.italic || false;
        const entriesUnderline = entriesSettings.underline || false;
        const entriesFiller = entriesSettings.filler || 'dotted';
        const entriesSizePt = entriesFontSize.replace('px', 'pt');

        let fillerTypst = 'repeat([.])';
        if (entriesFiller === 'line') fillerTypst = 'line(length: 100%)';
        else if (entriesFiller === 'empty') fillerTypst = 'none';

        const entryStyles: string[] = [];
        entryStyles.push(`size: ${entriesSizePt}`);
        if (entriesBold) entryStyles.push('weight: "bold"');
        if (entriesItalic) entryStyles.push('style: "italic"');

        let titleTypst = '';
        if (outlineSettings.title?.content) {
            const titleWithImages = await convertIndexedDbImagesToBase64(outlineSettings.title.content);
            titleTypst = await contentToTypst(titleWithImages, { title, scaleImages: false, insideContext: false, pageNumberOffset });
        }

        const textSetRule = `#set text(${entryStyles.join(', ')})`;
        const enabledLevels = getEnabledHeadingLevels(settings);

        const underlineWrapStart = entriesUnderline ? 'underline[' : '';
        const underlineWrapEnd = entriesUnderline ? ']' : '';

        const buildNumberingLogic = () => {
            let logic = '  let lvl = it.element.level\n';
            logic += '  let num-str = ""\n';
            if (enabledLevels.length === 0) return logic;

            enabledLevels.forEach((level, idx) => {
                const ancestorLevels = enabledLevels.filter(l => l <= level);
                const condition = idx === 0 ? 'if' : 'else if';
                logic += `  ${condition} lvl == ${level} {\n`;
                const parts = ancestorLevels.map(l => {
                    if (l === level) {
                        return `str(counter("h${l}-counter").at(loc).first() + 1)`;
                    } else {
                        return `str(counter("h${l}-counter").at(loc).first())`;
                    }
                });
                if (parts.length > 0) {
                    logic += `    num-str = ${parts.join(' + "." + ')} + "."\n`;
                }
                logic += '  }\n';
            });
            return logic;
        };

        const numberingLogic = buildNumberingLogic();

        let outlineShowRule = '';
        if (pageNumberOffset !== 0) {
            outlineShowRule = `
#show link: it => it.body
#show outline.entry: it => {
  let loc = it.element.location()
  let page-num = counter(page).at(loc).first()
  let adjusted-page = page-num + ${pageNumberOffset}
  let page-display = if adjusted-page >= 1 { str(adjusted-page) } else { "" }
${numberingLogic}
  block(link(loc, ${underlineWrapStart}it.indented([#num-str], [#it.body() #box(width: 1fr, it.fill) #page-display])${underlineWrapEnd}))
}`;
        } else {
            outlineShowRule = `
#show link: it => it.body
#show outline.entry: it => {
  let loc = it.element.location()
${numberingLogic}
  block(link(loc, ${underlineWrapStart}it.indented([#num-str], [#it.body() #box(width: 1fr, it.fill) #it.page()])${underlineWrapEnd}))
}`;
        }

        const outlineEmptyPages = settings.outline?.emptyPagesAfter || 0;
        let outlineEmptyPagesTypst = '';
        for (let i = 0; i < outlineEmptyPages; i++) {
            outlineEmptyPagesTypst += '#page[]\n';
        }

        outlineContent = `// Table of Contents
${titleTypst}
#v(1em)
#set outline.entry(fill: ${fillerTypst})
${textSetRule}
${outlineShowRule}
#outline(title: none)
#pagebreak()
${outlineEmptyPagesTypst}
`;
    }

    const frontPageEmptyPages = settings?.frontPage?.emptyPagesAfter || 0;
    let frontPageEmptyPagesTypst = '';
    for (let i = 0; i < frontPageEmptyPages; i++) {
        frontPageEmptyPagesTypst += '#page[]\n';
    }

    if (frontPageContent) {
        bodyContent = `${frontPageContent}\n#pagebreak()\n${frontPageEmptyPagesTypst}${outlineContent}${typstBody}`;
    } else if (outlineContent) {
        bodyContent = `${outlineContent}${typstBody}`;
    }

    const fullSourceRaw = `${preamble}\n\n${bodyContent}`;
    const typstResult = await processTypstImages(fullSourceRaw);
    return typstResult.source;
}

/**
 * Hook for compiling PDFs using client-side Typst WASM
 * Attempts to use Web Worker for non-blocking compilation, falls back to main thread
 */
export function usePdfCompiler(): UsePdfCompilerReturn {
    const [isCompiling, setIsCompiling] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [isInitialized, setIsInitialized] = useState(false);
    const [initError, setInitError] = useState<string | null>(null);
    const [compilationStage, setCompilationStage] = useState<'idle' | 'initializing' | 'compiling' | 'processing-images'>('idle');

    const workerRef = useRef<Worker | null>(null);
    const workerAvailableRef = useRef<boolean>(false);
    const pendingRequestsRef = useRef<Map<string, { resolve: (value: ArrayBuffer) => void; reject: (error: Error) => void }>>(new Map());
    const currentCompilationIdRef = useRef<string | null>(null);
    const customFonts = useStore((state) => state.customFonts);
    // Use null to indicate "never initialized" vs empty string for "initialized with no fonts"
    const fontsLoadedRef = useRef<string | null>(null);
    const initializingRef = useRef(false);
    const mainThreadInitializedRef = useRef(false);

    // Flag to track if we should fall back to main thread
    const shouldFallbackToMainThreadRef = useRef(false);

    // Try to create worker on mount
    useEffect(() => {
        let worker: Worker | null = null;
        
        try {
            // Try to create worker - may fail in some environments
            worker = new Worker(
                new URL('../lib/typst/typst-worker.ts', import.meta.url),
                { type: 'module' }
            );

            worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
                const response = event.data;

                switch (response.type) {
                    case 'init-result': {
                        if (response.success) {
                            workerAvailableRef.current = true;
                            setIsInitialized(true);
                            setInitError(null);
                            console.log('[usePdfCompiler] Worker initialized successfully');
                        } else {
                            // Worker init failed, fall back to main thread
                            console.warn('[usePdfCompiler] Worker init failed, using main thread:', response.error);
                            workerAvailableRef.current = false;
                            shouldFallbackToMainThreadRef.current = true;
                        }
                        break;
                    }

                    case 'compile-result': {
                        const pending = pendingRequestsRef.current.get(response.id);
                        if (pending) {
                            pendingRequestsRef.current.delete(response.id);
                            if (response.success && response.pdf) {
                                pending.resolve(response.pdf);
                            } else {
                                pending.reject(new Error(response.error || 'Compilation failed'));
                            }
                        }
                        if (currentCompilationIdRef.current === response.id) {
                            setIsCompiling(false);
                            setCompilationStage('idle');
                        }
                        break;
                    }

                    case 'progress': {
                        setCompilationStage(response.stage);
                        break;
                    }
                }
            };

            worker.onerror = (error) => {
                console.warn('[usePdfCompiler] Worker error, falling back to main thread:', error);
                workerAvailableRef.current = false;
                shouldFallbackToMainThreadRef.current = true;
            };

            workerRef.current = worker;
        } catch (e) {
            console.warn('[usePdfCompiler] Failed to create worker, using main thread:', e);
            workerAvailableRef.current = false;
            shouldFallbackToMainThreadRef.current = true;
        }

        // Cleanup
        return () => {
            if (worker) {
                worker.terminate();
            }
            workerRef.current = null;
        };
    }, []);

    // Initialize main thread compiler (fallback)
    // forceReinit: when true, reinitializes even if already initialized (for font changes)
    const initMainThread = useCallback(async (forceReinit: boolean = false) => {
        if (initializingRef.current) return;
        if (mainThreadInitializedRef.current && !forceReinit) return;
        
        initializingRef.current = true;

        try {
            const validFonts = customFonts.filter(f => f.blob && f.blob.size > 0);
            const fontData: FontData[] = await Promise.all(
                validFonts.map(async (font): Promise<FontData> => {
                    const data = await blobToUint8Array(font.blob);
                    return { family: font.family, data };
                })
            );

            await setCustomFonts(fontData);
            await initializeCompiler();
            
            mainThreadInitializedRef.current = true;
            setIsInitialized(true);
            setInitError(null);
            console.log('[usePdfCompiler] Main thread compiler initialized with fonts:', validFonts.map(f => f.family));
        } catch (e: any) {
            console.error('[usePdfCompiler] Failed to initialize main thread compiler:', e);
            setInitError(e.message || 'Failed to initialize PDF compiler');
        } finally {
            initializingRef.current = false;
        }
    }, [customFonts]);

    // Initialize worker or main thread with fonts when fonts change
    useEffect(() => {
        const fontSignature = customFonts.map(f => `${f.family}-${f.blob?.size || 0}`).join(',');

        // Skip if fonts haven't changed
        if (fontsLoadedRef.current === fontSignature) {
            return;
        }

        const initWithFonts = async () => {
            const validFonts = customFonts.filter(f => f.blob && f.blob.size > 0);
            // fontsChanged is true only if we've initialized before AND the signature differs
            const fontsChanged = fontsLoadedRef.current !== null && fontsLoadedRef.current !== fontSignature;

            // Check if we should fall back to main thread (worker failed)
            if (shouldFallbackToMainThreadRef.current) {
                await initMainThread(fontsChanged);
                fontsLoadedRef.current = fontSignature;
                return;
            }

            // Try worker if available
            if (workerRef.current && !shouldFallbackToMainThreadRef.current) {
                try {
                    // Convert fonts once - use for both main thread and worker
                    const fontDataArrays = await Promise.all(
                        validFonts.map(async (font) => {
                            const data = await blobToUint8Array(font.blob);
                            return { family: font.family, data };
                        })
                    );

                    // IMPORTANT: Register fonts on main thread for generatePreamble
                    // generatePreamble runs on main thread even when using worker
                    await setCustomFonts(fontDataArrays);

                    // Prepare transferable format for worker (needs ArrayBuffer not Uint8Array)
                    const fontDataForWorker: FontDataTransfer[] = fontDataArrays.map(f => ({
                        family: f.family,
                        data: f.data.buffer.slice(f.data.byteOffset, f.data.byteOffset + f.data.byteLength) as ArrayBuffer
                    }));

                    const initRequest: WorkerRequest = {
                        type: 'init',
                        id: generateId(),
                        fonts: fontDataForWorker
                    };

                    // Transfer font buffers to worker
                    const transferables = fontDataForWorker.map(f => f.data);
                    workerRef.current.postMessage(initRequest, transferables);

                    fontsLoadedRef.current = fontSignature;
                    console.log('[usePdfCompiler] Initializing worker with fonts:', validFonts.map(f => f.family));
                } catch (e: any) {
                    console.warn('[usePdfCompiler] Failed to init worker with fonts, using main thread:', e);
                    workerAvailableRef.current = false;
                    shouldFallbackToMainThreadRef.current = true;
                    // Force reinit if fonts changed
                    await initMainThread(fontsChanged);
                    fontsLoadedRef.current = fontSignature;
                }
            } else if (!workerRef.current) {
                // Worker not created yet, use main thread
                await initMainThread(fontsChanged);
                fontsLoadedRef.current = fontSignature;
            }
        };

        initWithFonts();
    }, [customFonts, initMainThread]);

    // Cancel current compilation
    const cancelCompilation = useCallback(() => {
        if (currentCompilationIdRef.current) {
            // Send cancel to worker if using worker
            if (workerRef.current && workerAvailableRef.current) {
                const cancelRequest: WorkerRequest = {
                    type: 'cancel',
                    id: currentCompilationIdRef.current
                };
                workerRef.current.postMessage(cancelRequest);
            }
            
            // Reject the pending promise
            const pending = pendingRequestsRef.current.get(currentCompilationIdRef.current);
            if (pending) {
                pendingRequestsRef.current.delete(currentCompilationIdRef.current);
                pending.reject(new Error('Compilation cancelled'));
            }
            
            currentCompilationIdRef.current = null;
            setIsCompiling(false);
            setCompilationStage('idle');
            console.log('[usePdfCompiler] Compilation cancelled');
        }
    }, []);

    // Compile using worker
    const compileWithWorker = useCallback(async (source: string, compilationId: string): Promise<ArrayBuffer> => {
        return new Promise<ArrayBuffer>((resolve, reject) => {
            pendingRequestsRef.current.set(compilationId, { resolve, reject });

            const compileRequest: WorkerRequest = {
                type: 'compile',
                id: compilationId,
                source: source
            };

            workerRef.current!.postMessage(compileRequest);
        });
    }, []);

    // Compile using main thread (fallback)
    const compileWithMainThread = useCallback(async (source: string): Promise<ArrayBuffer> => {
        await resetCompiler();
        const pdfBuffer = await compileTypstToPdfMainThread({ source });
        return pdfBuffer.buffer.slice(
            pdfBuffer.byteOffset,
            pdfBuffer.byteOffset + pdfBuffer.byteLength
        ) as ArrayBuffer;
    }, []);

    const compilePdf = useCallback(async (options: CompileOptions): Promise<ArrayBuffer> => {
        // Cancel any existing compilation
        cancelCompilation();

        setIsCompiling(true);
        setError(null);
        setCompilationStage('processing-images');

        const compilationId = generateId();
        currentCompilationIdRef.current = compilationId;

        try {
            // Build Typst source (this needs main thread for IndexedDB access)
            const fullSource = await buildTypstSource(options);

            // Check if cancelled
            if (currentCompilationIdRef.current !== compilationId) {
                throw new Error('Compilation cancelled');
            }

            setCompilationStage('compiling');

            // Try worker first, fall back to main thread
            if (workerRef.current && workerAvailableRef.current) {
                try {
                    return await compileWithWorker(fullSource, compilationId);
                } catch (e: any) {
                    if (e.message === 'Compilation cancelled') {
                        throw e;
                    }
                    console.warn('[usePdfCompiler] Worker compilation failed, trying main thread:', e);
                    // Fall through to main thread
                }
            }

            // Main thread compilation
            return await compileWithMainThread(fullSource);

        } catch (e: any) {
            const errorMessage = e.message || 'Failed to compile PDF';
            if (errorMessage !== 'Compilation cancelled') {
                console.error('[usePdfCompiler] Compilation error:', e);
                setError(errorMessage);
            }
            throw e;
        } finally {
            if (currentCompilationIdRef.current === compilationId) {
                setIsCompiling(false);
                setCompilationStage('idle');
            }
        }
    }, [cancelCompilation, compileWithWorker, compileWithMainThread]);

    return {
        compilePdf,
        cancelCompilation,
        isCompiling,
        error,
        isInitialized,
        initError,
        compilationStage
    };
}
