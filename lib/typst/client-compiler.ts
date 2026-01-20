'use client';

export interface FontData {
    family: string;
    data: Uint8Array;
}

export interface TypstOptions {
    margins?: { top: string; bottom: string; left: string; right: string };
    fontFamily?: string;
    fontSize?: string;
    header?: string;
    footer?: string;
    pageLayout?: 'portrait' | 'horizontal' | 'vertical';
    backgroundColor?: string;
    textColor?: string;
    h1?: { fontSize?: string; color?: string; textAlign?: string; borderBottom?: boolean; numbering?: { enabled?: boolean } };
    h2?: { fontSize?: string; color?: string; textAlign?: string; borderBottom?: boolean };
    h3?: { fontSize?: string; color?: string; textAlign?: string; borderBottom?: boolean };
    h4?: { fontSize?: string; color?: string; textAlign?: string; borderBottom?: boolean };
    h5?: { fontSize?: string; color?: string; textAlign?: string; borderBottom?: boolean };
    h6?: { fontSize?: string; color?: string; textAlign?: string; borderBottom?: boolean };
}

export function fixTypstUnit(value: string | number | undefined): string {
    if (value === undefined || value === null || value === '') return '0pt';
    const s = String(value).trim();
    if (/^-?\d+(\.\d+)?$/.test(s)) return s + 'pt';
    if (s.toLowerCase().endsWith('px')) {
        const num = parseFloat(s);
        return isNaN(num) ? '0pt' : `${num}pt`;
    }
    if (/^-?\d+(\.\d+)?[a-zA-Z%]+$/.test(s)) {
        if (s.toLowerCase().endsWith('rem')) return s.slice(0, -3) + 'em';
        if (s.toLowerCase().endsWith('mc')) return s.slice(0, -2) + 'cm';
        return s;
    }
    if (['cm', 'mm', 'in', 'pt', 'em'].includes(s.toLowerCase())) {
        return `1${s.toLowerCase()}`;
    }
    return '0pt';
}

export function generatePreamble(options: TypstOptions): string {
    const {
        margins,
        fontFamily = 'sans-serif', // Use generic font that Typst has
        fontSize = '12pt',
        header = '',
        footer = '',
        pageLayout = 'portrait'
    } = options;

    const isFlipped = pageLayout === 'horizontal';

    const typstMargins = {
        top: fixTypstUnit(margins?.top || '2cm'),
        bottom: fixTypstUnit(margins?.bottom || '2cm'),
        left: fixTypstUnit(margins?.left || '2cm'),
        right: fixTypstUnit(margins?.right || '2cm'),
    };

    const settings = options as any;
    const bgColor = settings.backgroundColor || '#ffffff';
    const textColor = settings.textColor || '#333333';

    const headingStyles = (['h1', 'h2', 'h3', 'h4', 'h5', 'h6'] as const).map((tag, i) => {
        const h = settings[tag] || {};
        const level = i + 1;
        const size = fixTypstUnit(h.fontSize || (level === 1 ? '1.5em' : level === 2 ? '1.3em' : '1em'));
        const color = h.color || 'inherit';
        const align = h.textAlign || 'left';

        let rules = `#show heading.where(level: ${level}): set text(size: ${size}, fill: rgb("${color !== 'inherit' ? color : textColor}"))\n`;
        rules += `#show heading.where(level: ${level}): set align(${align})\n`;

        if (h.borderBottom) {
            rules += `#show heading.where(level: ${level}): it => block(below: 1em)[
               #it
               #line(length: 100%, stroke: 1pt + rgb("${color !== 'inherit' ? color : '#000000'}"))
             ]\n`;
        }
        return rules;
    }).join('\n');

    // Map common font names to fonts from typst.ts text assets
    // Available: DejaVu Sans Mono, Libertinus Serif, New Computer Modern
    let cleanedFont = fontFamily.split(',')[0].replace(/['"]/g, '').trim();
    const fontMap: Record<string, string> = {
        // Serif fonts -> Libertinus Serif
        'times new roman': 'Libertinus Serif',
        'georgia': 'Libertinus Serif',
        'serif': 'Libertinus Serif',
        'linux libertine': 'Libertinus Serif',
        'libertinus serif': 'Libertinus Serif',
        // Sans-serif fonts -> Libertinus Serif (no sans in text assets, use serif as fallback)
        'inter': 'Libertinus Serif',
        'arial': 'Libertinus Serif',
        'helvetica': 'Libertinus Serif',
        'verdana': 'Libertinus Serif',
        'sans-serif': 'Libertinus Serif',
        // Monospace fonts -> DejaVu Sans Mono
        'jetbrains mono': 'DejaVu Sans Mono',
        'fira code': 'DejaVu Sans Mono',
        'source code pro': 'DejaVu Sans Mono',
        'consolas': 'DejaVu Sans Mono',
        'monaco': 'DejaVu Sans Mono',
        'dejavu sans mono': 'DejaVu Sans Mono',
        'monospace': 'DejaVu Sans Mono',
        // Math font
        'computer modern': 'New Computer Modern',
    };
    cleanedFont = fontMap[cleanedFont.toLowerCase()] || 'Libertinus Serif';

    return `
#set page(
  paper: "a4",
  flipped: ${isFlipped},
  margin: (
    top: ${typstMargins.top}, 
    bottom: ${typstMargins.bottom}, 
    left: ${typstMargins.left}, 
    right: ${typstMargins.right}
  ),
  fill: rgb("${bgColor}"),
  header: [
    ${header}
  ],
  footer: [
    ${footer}
  ]
)

#set text(
  font: "${cleanedFont}",
  size: ${fixTypstUnit(fontSize)},
  fill: rgb("${textColor}"),
  lang: "en"
)

#set heading(numbering: "1.1") 
${settings.h1?.numbering?.enabled ? '' : '#set heading(numbering: none)'}

${headingStyles}

// Common styles
#show link: underline
#show table: set table(stroke: 0.5pt + gray)
`;
}

// Compiler state
let isInitialized = false;
let initPromise: Promise<void> | null = null;
let typstCompiler: any = null;

// CDN URLs
const CDN_BASE = 'https://cdn.jsdelivr.net/npm';
const TYPST_VERSION = '0.7.0-rc2';

/**
 * Initialize the Typst WASM compiler
 */
export async function initializeCompiler(): Promise<void> {
    if (isInitialized && typstCompiler) return;
    if (initPromise) return initPromise;

    initPromise = (async () => {
        try {
            console.log('[Typst] [Client] Initializing WASM compiler...');
            
            const typstModule = await import('@myriaddreamin/typst.ts');
            const { createTypstCompiler, initOptions } = typstModule;
            
            // Get the preloadFontAssets function from initOptions namespace
            const preloadFontAssets = initOptions.preloadFontAssets;
            
            // Create the compiler
            typstCompiler = createTypstCompiler();
            
            // Initialize with WASM from CDN and preload default font assets
            await typstCompiler.init({
                getModule: () => {
                    const wasmUrl = `${CDN_BASE}/@myriaddreamin/typst-ts-web-compiler@${TYPST_VERSION}/pkg/typst_ts_web_compiler_bg.wasm`;
                    console.log('[Typst] [Client] Fetching WASM from:', wasmUrl);
                    return fetch(wasmUrl);
                },
                // Use the library's built-in font loading
                beforeBuild: [
                    preloadFontAssets({
                        assets: ['text'], // Load text fonts (includes DejaVu Sans Mono, Libertinus Serif, New Computer Modern)
                    })
                ]
            });
            
            isInitialized = true;
            console.log('[Typst] [Client] WASM compiler initialized successfully');
        } catch (error) {
            console.error('[Typst] [Client] Failed to initialize compiler:', error);
            initPromise = null;
            throw error;
        }
    })();

    return initPromise;
}

export interface TypstImage {
    path: string;
    data: Uint8Array;
}

export interface CompileArgs {
    source: string;
    images?: TypstImage[];
    fonts?: FontData[];
}

/**
 * Extract data URLs from source and add them as shadow files
 */
function processDataUrlsToShadow(source: string, compiler: any): string {
    const dataUrlRegex = /image\s*\(\s*["'](data:image\/[^"']+)["']/g;
    let match;
    let newSource = source;
    let imageIndex = 0;
    const replacements: [string, string][] = [];
    
    // Reset regex
    dataUrlRegex.lastIndex = 0;
    
    while ((match = dataUrlRegex.exec(source)) !== null) {
        const dataUrl = match[1];
        
        // Determine extension from mime type
        let ext = '.png';
        if (dataUrl.includes('image/jpeg') || dataUrl.includes('image/jpg')) ext = '.jpg';
        else if (dataUrl.includes('image/gif')) ext = '.gif';
        else if (dataUrl.includes('image/webp')) ext = '.webp';
        else if (dataUrl.includes('image/svg')) ext = '.svg';
        
        const virtualPath = `/image_${imageIndex++}${ext}`;
        
        try {
            // Parse data URL
            const commaIndex = dataUrl.indexOf(',');
            if (commaIndex !== -1) {
                const base64Data = dataUrl.substring(commaIndex + 1);
                const binaryString = atob(base64Data);
                const bytes = new Uint8Array(binaryString.length);
                for (let i = 0; i < binaryString.length; i++) {
                    bytes[i] = binaryString.charCodeAt(i);
                }
                
                // Add to compiler's shadow filesystem
                compiler.mapShadow(virtualPath, bytes);
                replacements.push([dataUrl, virtualPath]);
                console.log(`[Typst] [Client] Mapped data URL to ${virtualPath} (${bytes.length} bytes)`);
            }
        } catch (e) {
            console.error('[Typst] [Client] Failed to process data URL:', e);
        }
    }
    
    // Replace data URLs with virtual paths
    for (const [dataUrl, virtualPath] of replacements) {
        newSource = newSource.split(`"${dataUrl}"`).join(`"${virtualPath}"`);
        newSource = newSource.split(`'${dataUrl}'`).join(`'${virtualPath}'`);
    }
    
    return newSource;
}

/**
 * Compile Typst source to PDF using the WASM compiler
 */
export async function compileTypstToPdf({ source }: CompileArgs): Promise<Uint8Array> {
    await initializeCompiler();

    if (!typstCompiler) {
        throw new Error('Typst compiler not initialized');
    }

    console.log(`[Typst] [Client] Compiling source (${source.length} chars)`);

    try {
        // Reset shadow files for fresh compilation
        typstCompiler.resetShadow();
        
        // Process data URLs in the source and add images to shadow filesystem
        const processedSource = processDataUrlsToShadow(source, typstCompiler);
        
        // Add main file using addSource (for text files)
        typstCompiler.addSource('/main.typ', processedSource);
        
        // Compile directly to PDF format
        // CompileFormatEnum.pdf = 1
        const result = await typstCompiler.compile({
            mainFilePath: '/main.typ',
            format: 1 // CompileFormatEnum.pdf
        });
        
        if (!result.result) {
            const diagnostics = result.diagnostics || [];
            const errorMsg = diagnostics.map((d: any) => d.message || JSON.stringify(d)).join('\n') || 'Compilation failed';
            throw new Error(errorMsg);
        }

        const pdfData = result.result;

        if (!pdfData || pdfData.length === 0) {
            throw new Error('Typst returned an empty PDF buffer.');
        }

        console.log(`[Typst] [Client] SUCCESS: Generated PDF (${pdfData.length} bytes)`);
        return pdfData;
    } catch (error) {
        console.error('[Typst] [Client] Compilation error:', error);
        throw error;
    }
}

/**
 * Reset the compiler state
 */
export async function resetCompiler(): Promise<void> {
    if (typstCompiler) {
        typstCompiler.resetShadow();
    }
    console.log('[Typst] [Client] Compiler ready for new compilation');
}
