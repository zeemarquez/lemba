'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { markdownToTypst } from '@/lib/typst/markdown-to-typst';
import { serializeNodesToTypst } from '@/lib/typst/serialize-nodes';
import { 
    compileTypstToPdf, 
    generatePreamble, 
    initializeCompiler,
    resetCompiler,
    setCustomFonts,
    FontData,
    TypstOptions 
} from '@/lib/typst/client-compiler';
import { processTypstImages } from '@/lib/typst/client-image-manager';
import { convertIndexedDbImagesToBase64 } from '@/hooks/use-indexed-db-image';
import { useStore } from '@/lib/store';

// Settings type that matches the template settings from the store
export interface TemplateSettings {
    fontFamily?: string;
    fontSize?: string;
    textColor?: string;
    backgroundColor?: string;
    pageLayout?: 'vertical' | 'horizontal';
    margins?: { top: string; bottom: string; left: string; right: string };
    h1?: { fontSize?: string; color?: string; textAlign?: string; borderBottom?: boolean; numbering?: { enabled?: boolean } };
    h2?: { fontSize?: string; color?: string; textAlign?: string; borderBottom?: boolean };
    h3?: { fontSize?: string; color?: string; textAlign?: string; borderBottom?: boolean };
    h4?: { fontSize?: string; color?: string; textAlign?: string; borderBottom?: boolean };
    h5?: { fontSize?: string; color?: string; textAlign?: string; borderBottom?: boolean };
    h6?: { fontSize?: string; color?: string; textAlign?: string; borderBottom?: boolean };
    header?: { enabled?: boolean; content?: string; margins?: { top: string; bottom: string; left: string; right: string } };
    footer?: { enabled?: boolean; content?: string; margins?: { top: string; bottom: string; left: string; right: string } };
    [key: string]: unknown;
}

export interface CompileOptions {
    markdown: string;
    title?: string;
    settings?: TemplateSettings;
}

export interface UsePdfCompilerReturn {
    compilePdf: (options: CompileOptions) => Promise<ArrayBuffer>;
    isCompiling: boolean;
    error: string | null;
    isInitialized: boolean;
    initError: string | null;
}

/**
 * Convert header/footer content to Typst
 */
async function headerFooterToTypst(content: string, context: { title?: string }): Promise<string> {
    if (!content) return '';

    try {
        const parsed = JSON.parse(content);
        if (Array.isArray(parsed) && parsed.length > 0) {
            // It's Plate content (JSON)
            return serializeNodesToTypst(parsed, { title: context.title });
        }
    } catch {
        // Not JSON, assume markdown string
    }

    // For markdown headers, we use our converter
    return markdownToTypst(content).trim();
}


/**
 * Convert Blob to Uint8Array
 */
async function blobToUint8Array(blob: Blob): Promise<Uint8Array> {
    const arrayBuffer = await blob.arrayBuffer();
    return new Uint8Array(arrayBuffer);
}

/**
 * Hook for compiling PDFs using client-side Typst WASM
 */
export function usePdfCompiler(): UsePdfCompilerReturn {
    const [isCompiling, setIsCompiling] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [isInitialized, setIsInitialized] = useState(false);
    const [initError, setInitError] = useState<string | null>(null);
    
    const initializingRef = useRef(false);
    const customFonts = useStore((state) => state.customFonts);
    const fontsLoadedRef = useRef<string>('');

    // Initialize compiler on mount and when custom fonts change
    useEffect(() => {
        const initWithFonts = async () => {
            try {
                // Convert store fonts to FontData format
                const fontDataPromises = customFonts.map(async (font): Promise<FontData> => ({
                    family: font.family,
                    data: await blobToUint8Array(font.blob)
                }));
                const fontData = await Promise.all(fontDataPromises);
                
                // Create a signature to detect changes
                const fontSignature = customFonts.map(f => `${f.family}-${f.blob.size}`).join(',');
                
                // Only reinit if fonts changed or first init
                if (fontsLoadedRef.current !== fontSignature || !initializingRef.current) {
                    console.log('[usePdfCompiler] Loading fonts:', customFonts.map(f => f.family).join(', ') || 'none');
                    
                    // Set custom fonts (this will trigger reinit if needed)
                    await setCustomFonts(fontData);
                    
                    // Initialize compiler
                    await initializeCompiler();
                    
                    fontsLoadedRef.current = fontSignature;
                    initializingRef.current = true;
                    setIsInitialized(true);
                    console.log('[usePdfCompiler] Compiler initialized with fonts');
                }
            } catch (e: any) {
                console.error('[usePdfCompiler] Failed to initialize compiler:', e);
                setInitError(e.message || 'Failed to initialize PDF compiler');
            }
        };

        initWithFonts();
    }, [customFonts]);

    const compilePdf = useCallback(async (options: CompileOptions): Promise<ArrayBuffer> => {
        const { markdown, title, settings } = options;

        setIsCompiling(true);
        setError(null);

        try {
            // Reset compiler state before each compilation
            await resetCompiler();

            // 1. Convert IndexedDB images to base64/data URLs in markdown
            const markdownWithImages = await convertIndexedDbImagesToBase64(markdown || '');

            // 2. Convert Markdown to Typst
            const typstBody = markdownToTypst(markdownWithImages);

            // 3. Prepare Header/Footer
            let headerContent = '';
            let footerContent = '';
            
            if (settings?.header?.enabled && settings?.header?.content) {
                const headerWithImages = await convertIndexedDbImagesToBase64(settings.header.content);
                headerContent = await headerFooterToTypst(headerWithImages, { title });
            }
            
            if (settings?.footer?.enabled && settings?.footer?.content) {
                const footerWithImages = await convertIndexedDbImagesToBase64(settings.footer.content);
                footerContent = await headerFooterToTypst(footerWithImages, { title });
            }

            // 4. Generate Preamble
            const typstOptions: TypstOptions = {
                ...settings,
                header: headerContent,
                footer: footerContent,
                fontFamily: settings?.fontFamily || 'Inter',
            };

            const preamble = generatePreamble(typstOptions);

            // 5. Combine source and process images (convert URLs to data URLs)
            const fullSourceRaw = `${preamble}\n\n${typstBody}`;
            const typstResult = await processTypstImages(fullSourceRaw);
            const fullSource = typstResult.source;

            // 6. Compile to PDF
            const pdfBuffer = await compileTypstToPdf({
                source: fullSource
            });

            // Return as ArrayBuffer for compatibility with Blob
            return pdfBuffer.buffer.slice(
                pdfBuffer.byteOffset, 
                pdfBuffer.byteOffset + pdfBuffer.byteLength
            ) as ArrayBuffer;
        } catch (e: any) {
            const errorMessage = e.message || 'Failed to compile PDF';
            console.error('[usePdfCompiler] Compilation error:', e);
            setError(errorMessage);
            throw e;
        } finally {
            setIsCompiling(false);
        }
    }, []);

    return {
        compilePdf,
        isCompiling,
        error,
        isInitialized,
        initError
    };
}
