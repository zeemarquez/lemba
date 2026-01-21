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
    TypstOptions,
    getEnabledHeadingLevels
} from '@/lib/typst/client-compiler';
import { processTypstImages } from '@/lib/typst/client-image-manager';
import { convertIndexedDbImagesToBase64 } from '@/hooks/use-indexed-db-image';
import { useStore } from '@/lib/store';
import { parseVariablesFromFrontmatter } from '@/components/export/ExportSidebar';

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
        headerStyle?: {
            bold?: boolean;
            italic?: boolean;
            underline?: boolean;
            backgroundColor?: string;
            textColor?: string;
        };
        cellStyle?: {
            bold?: boolean;
            italic?: boolean;
            underline?: boolean;
            backgroundColor?: string;
            textColor?: string;
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
        captionFormat?: string; // e.g., "Figure #: {Caption}"
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
 * Convert Plate/markdown content to Typst
 * @param scaleImages - If true, applies scaling to images (used for header/footer)
 * @param insideContext - If true, content will be rendered inside a context expression (header/footer)
 * @param tables - Table settings from template
 * @param pageNumberOffset - Calculated page number offset from startPageNumber setting
 * @param variables - Variable values from document frontmatter
 * @param figures - Figure caption settings from template
 */
async function contentToTypst(content: string, context: { title?: string; scaleImages?: boolean; insideContext?: boolean; tables?: { preventPageBreak?: boolean }; pageNumberOffset?: number; variables?: Record<string, string>; figures?: { captionEnabled?: boolean; captionFormat?: string } }): Promise<string> {
    if (!content) return '';

    try {
        const parsed = JSON.parse(content);
        if (Array.isArray(parsed) && parsed.length > 0) {
            // It's Plate content (JSON)
            return serializeNodesToTypst(parsed, { 
                title: context.title, 
                scaleImages: context.scaleImages,
                insideContext: context.insideContext,
                tables: context.tables,
                pageNumberOffset: context.pageNumberOffset,
                variables: context.variables,
                figures: context.figures
            });
        }
    } catch {
        // Not JSON, assume markdown string
    }

    // For markdown content, we use our converter
    return markdownToTypst(content, { figures: context.figures }).trim();
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
            
            // 1.5. Parse variable values from frontmatter
            const variables = parseVariablesFromFrontmatter(markdownWithImages);

            // 2. Convert Markdown to Typst
            const typstBody = markdownToTypst(markdownWithImages, { tables: settings?.tables, figures: settings?.figures });

            // 3. Prepare Header/Footer/Front Page
            let headerContent = '';
            let footerContent = '';
            let frontPageContent = '';
            
            // Calculate page number offset from startPageNumber setting
            // If startPageNumber is 2, page 2 should display as 1, so offset = 1 - 2 = -1
            const startPageNumber = settings?.startPageNumber || 1;
            const pageNumberOffset = 1 - startPageNumber;

            if (settings?.header?.enabled && settings?.header?.content) {
                const headerWithImages = await convertIndexedDbImagesToBase64(settings.header.content);
                // Header is inside context expression, so insideContext=true
                headerContent = await contentToTypst(headerWithImages, { title, scaleImages: true, insideContext: true, pageNumberOffset, variables });
            }
            
            if (settings?.footer?.enabled && settings?.footer?.content) {
                const footerWithImages = await convertIndexedDbImagesToBase64(settings.footer.content);
                // Footer is inside context expression, so insideContext=true
                footerContent = await contentToTypst(footerWithImages, { title, scaleImages: true, insideContext: true, pageNumberOffset, variables });
            }

            if (settings?.frontPage?.enabled && settings?.frontPage?.content) {
                const frontPageWithImages = await convertIndexedDbImagesToBase64(settings.frontPage.content);
                // Front page is in document body, NOT inside context, so insideContext=false
                frontPageContent = await contentToTypst(frontPageWithImages, { title, scaleImages: false, insideContext: false, tables: settings?.tables, pageNumberOffset, variables, figures: settings?.figures });
            }

            // 4. Generate Preamble
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

            // 5. Combine source and process images (convert URLs to data URLs)
            // If front page is enabled, add it before the main content with a page break
            // If outline is enabled, add it after front page (if any) but before main content
            let bodyContent = typstBody;
            
            // Build outline section if enabled
            let outlineContent = '';
            if (settings?.outline?.enabled) {
                const outlineSettings = settings.outline;
                const entriesSettings = outlineSettings.entries || {};
                
                // Build entries style
                const entriesFontSize = entriesSettings.fontSize || '12px';
                const entriesBold = entriesSettings.bold || false;
                const entriesItalic = entriesSettings.italic || false;
                const entriesUnderline = entriesSettings.underline || false;
                const entriesFiller = entriesSettings.filler || 'dotted';
                
                // Convert font size to Typst format (remove 'px' and add 'pt')
                const entriesSizePt = entriesFontSize.replace('px', 'pt');
                
                // Build filler string for Typst (set on outline.entry, not outline)
                let fillerTypst = 'repeat([.])'; // dotted (default)
                if (entriesFiller === 'line') {
                    fillerTypst = 'line(length: 100%)';
                } else if (entriesFiller === 'empty') {
                    fillerTypst = 'none';
                }
                
                // Build entry text styles for #set text()
                const entryStyles: string[] = [];
                entryStyles.push(`size: ${entriesSizePt}`);
                if (entriesBold) entryStyles.push('weight: "bold"');
                if (entriesItalic) entryStyles.push('style: "italic"');
                
                // Process title content (rich text from Plate editor)
                let titleTypst = '';
                if (outlineSettings.title?.content) {
                    const titleWithImages = await convertIndexedDbImagesToBase64(outlineSettings.title.content);
                    titleTypst = await contentToTypst(titleWithImages, { title, scaleImages: false, insideContext: false, pageNumberOffset });
                }
                
                // Build the outline with custom title and styling
                // Note: fill is set on outline.entry, not on outline() directly (Typst 0.13+)
                // Build text set rule for styling
                const textSetRule = `#set text(${entryStyles.join(', ')})`;
                
                // Get enabled heading levels for custom counter lookup
                const enabledLevels = getEnabledHeadingLevels(settings);
                
                // Build show rule for outline entries
                // Since we use custom counters (h1c, h2c, etc.) for heading numbering,
                // we need to manually build the numbering prefix for outline entries
                let outlineShowRule = '';
                
                // Build the underline wrapper if needed
                const underlineWrapStart = entriesUnderline ? 'underline[' : '';
                const underlineWrapEnd = entriesUnderline ? ']' : '';
                
                // Build the numbering logic for outline entries
                // Only query counters for enabled levels, building hierarchical numbering
                // e.g., if only h2 and h3 are enabled: "1." for h2, "1.1." for h3
                // Headings at disabled levels get no numbering prefix (empty string)
                //
                // IMPORTANT: counter.at(loc) returns the counter value BEFORE the heading's
                // show rule steps it. So for the current level, we need to add 1 to get
                // the actual displayed value. Ancestor levels are already stepped.
                const buildNumberingLogic = () => {
                    // Always initialize num-str as empty
                    let logic = '  let lvl = it.element.level\n';
                    logic += '  let num-str = ""\n';
                    
                    if (enabledLevels.length === 0) {
                        // No enabled levels - all headings get no numbering
                        return logic;
                    }
                    
                    // For each enabled level, check if the entry is at that level
                    // and build the appropriate numbering string
                    // Disabled levels will fall through and keep num-str as ""
                    enabledLevels.forEach((level, idx) => {
                        // ancestorLevels = only the enabled levels at or above this level
                        const ancestorLevels = enabledLevels.filter(l => l <= level);
                        const condition = idx === 0 ? 'if' : 'else if';
                        
                        logic += `  ${condition} lvl == ${level} {\n`;
                        
                        // Build numbering from all enabled ancestor levels
                        // For the current level (l == level), add 1 because counter.at(loc)
                        // returns the value before the step() call in the show rule
                        const parts = ancestorLevels.map(l => {
                            if (l === level) {
                                // Current level: counter hasn't been stepped yet at this location
                                return `str(counter("h${l}-counter").at(loc).first() + 1)`;
                            } else {
                                // Ancestor level: counter was already stepped
                                return `str(counter("h${l}-counter").at(loc).first())`;
                            }
                        });
                        if (parts.length > 0) {
                            logic += `    num-str = ${parts.join(' + "." + ')} + "."\n`;
                        }
                        
                        logic += '  }\n';
                    });
                    // Note: if lvl doesn't match any enabled level, num-str stays ""
                    // This means disabled levels (like H1 when only H2/H3 enabled) get no prefix
                    
                    return logic;
                };
                
                // Always use custom show rule since we use custom counters
                const numberingLogic = buildNumberingLogic();
                
                if (pageNumberOffset !== 0) {
                    // With page offset: adjust page numbers and use custom numbering
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
                    // No offset: use custom numbering with default page display
                    outlineShowRule = `
#show link: it => it.body
#show outline.entry: it => {
  let loc = it.element.location()
${numberingLogic}
  block(link(loc, ${underlineWrapStart}it.indented([#num-str], [#it.body() #box(width: 1fr, it.fill) #it.page()])${underlineWrapEnd}))
}`;
                }
                
                // Add empty pages after outline if specified
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
            
            // Add empty pages after front page if specified
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
