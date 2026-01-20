'use client';

export interface FontData {
    family: string;        // User-provided family name
    data: Uint8Array;
    internalName?: string; // Actual font family name from file metadata
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

// Track loaded custom fonts to avoid re-adding them
const loadedCustomFonts = new Set<string>();

// Custom font families that have been registered (for font mapping)
// Maps user-provided name -> internal font name from file
const registeredCustomFontFamilies = new Map<string, string>();

/**
 * Parse font family name from TTF/OTF/WOFF font file
 * Reads the 'name' table to extract the font family (nameID 1)
 */
function parseFontFamilyName(data: Uint8Array): string | null {
    try {
        const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
        
        // Check for TrueType/OpenType signature
        const signature = view.getUint32(0, false);
        const isTTF = signature === 0x00010000 || signature === 0x74727565; // 'true'
        const isOTF = signature === 0x4F54544F; // 'OTTO'
        const isWOFF = signature === 0x774F4646; // 'wOFF'
        const isWOFF2 = signature === 0x774F4632; // 'wOF2'
        
        if (!isTTF && !isOTF && !isWOFF && !isWOFF2) {
            console.warn('[Typst] Unknown font format, signature:', signature.toString(16));
            return null;
        }
        
        // For WOFF/WOFF2, the structure is different - tables are compressed
        // We need to find the 'name' table differently
        let numTables: number;
        let tableOffset: number;
        let tableEntrySize: number;
        
        if (isWOFF) {
            // WOFF header: signature(4), flavor(4), length(4), numTables(2), reserved(2), ...
            numTables = view.getUint16(12, false);
            tableOffset = 44; // WOFF table directory starts at offset 44
            tableEntrySize = 20; // Each WOFF table entry is 20 bytes
        } else if (isWOFF2) {
            // WOFF2 is more complex with compressed tables - skip for now
            console.warn('[Typst] WOFF2 font parsing not fully supported, using filename as fallback');
            return null;
        } else {
            // TTF/OTF: offset subtable starts at 0
            numTables = view.getUint16(4, false);
            tableOffset = 12;
            tableEntrySize = 16;
        }
        
        // Find 'name' table
        let nameTableOffset = 0;
        let nameTableCompLength = 0;
        let nameTableOrigLength = 0;
        
        for (let i = 0; i < numTables; i++) {
            const entryOffset = tableOffset + i * tableEntrySize;
            const tag = String.fromCharCode(
                view.getUint8(entryOffset),
                view.getUint8(entryOffset + 1),
                view.getUint8(entryOffset + 2),
                view.getUint8(entryOffset + 3)
            );
            if (tag === 'name') {
                if (isWOFF) {
                    // WOFF: tag(4), offset(4), compLength(4), origLength(4), origChecksum(4)
                    nameTableOffset = view.getUint32(entryOffset + 4, false);
                    nameTableCompLength = view.getUint32(entryOffset + 8, false);
                    nameTableOrigLength = view.getUint32(entryOffset + 12, false);
                } else {
                    // TTF/OTF: tag(4), checksum(4), offset(4), length(4)
                    nameTableOffset = view.getUint32(entryOffset + 8, false);
                }
                break;
            }
        }
        
        if (nameTableOffset === 0) {
            console.warn('[Typst] No name table found in font');
            return null;
        }
        
        // For WOFF, check if table is compressed (compLength !== origLength)
        if (isWOFF && nameTableCompLength !== nameTableOrigLength) {
            console.warn('[Typst] WOFF name table is compressed, cannot parse');
            return null;
        }
        
        // Parse name table
        const nameCount = view.getUint16(nameTableOffset + 2, false);
        const stringOffset = view.getUint16(nameTableOffset + 4, false);
        
        // Look for font family name (nameID 1) - prefer Windows platform
        let fallbackName: string | null = null;
        
        for (let i = 0; i < nameCount; i++) {
            const recordOffset = nameTableOffset + 6 + i * 12;
            const platformID = view.getUint16(recordOffset, false);
            const encodingID = view.getUint16(recordOffset + 2, false);
            const nameID = view.getUint16(recordOffset + 6, false);
            const length = view.getUint16(recordOffset + 8, false);
            const offset = view.getUint16(recordOffset + 10, false);
            
            // nameID 1 = Font Family
            if (nameID === 1) {
                const strOffset = nameTableOffset + stringOffset + offset;
                
                // Platform 3 (Windows), Encoding 1 (Unicode BMP) - UTF-16BE
                if (platformID === 3 && encodingID === 1) {
                    let name = '';
                    for (let j = 0; j < length; j += 2) {
                        name += String.fromCharCode(view.getUint16(strOffset + j, false));
                    }
                    if (name) {
                        return name; // Windows platform is preferred
                    }
                }
                // Platform 1 (Macintosh), Encoding 0 (Roman) - ASCII
                else if (platformID === 1 && encodingID === 0) {
                    let name = '';
                    for (let j = 0; j < length; j++) {
                        name += String.fromCharCode(view.getUint8(strOffset + j));
                    }
                    if (name && !fallbackName) {
                        fallbackName = name;
                    }
                }
            }
        }
        
        return fallbackName;
    } catch (e) {
        console.error('[Typst] Error parsing font:', e);
        return null;
    }
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
    // Plus any custom fonts that have been registered
    let cleanedFont = fontFamily.split(',')[0].replace(/['"]/g, '').trim();
    const cleanedFontLower = cleanedFont.toLowerCase();
    
    console.log(`[Typst] [generatePreamble] Input fontFamily: "${fontFamily}", cleaned: "${cleanedFont}"`);
    console.log(`[Typst] [generatePreamble] Registered custom fonts:`, Array.from(registeredCustomFontFamilies.entries()));
    
    // Check if this is a registered custom font first (case-insensitive check)
    // registeredCustomFontFamilies maps user-provided name -> internal font name
    let customFontInternalName: string | undefined;
    for (const [userFontName, internalName] of registeredCustomFontFamilies.entries()) {
        if (userFontName.toLowerCase() === cleanedFontLower) {
            customFontInternalName = internalName;
            break;
        }
    }
    
    if (customFontInternalName) {
        // Use the internal font name that Typst will recognize
        cleanedFont = customFontInternalName;
        console.log(`[Typst] [generatePreamble] Using custom font: "${fontFamily}" -> "${cleanedFont}"`);
    } else {
        // Fall back to built-in fonts
        const fontMap: Record<string, string> = {
            // Serif fonts -> Libertinus Serif
            'times new roman': 'Libertinus Serif',
            'georgia': 'Libertinus Serif',
            'serif': 'Libertinus Serif',
            'linux libertine': 'Libertinus Serif',
            'libertinus serif': 'Libertinus Serif',
            'merriweather': 'Libertinus Serif',
            'playfair display': 'Libertinus Serif',
            'lora': 'Libertinus Serif',
            // Sans-serif fonts -> Libertinus Serif (no sans in text assets, use serif as fallback)
            'inter': 'Libertinus Serif',
            'arial': 'Libertinus Serif',
            'helvetica': 'Libertinus Serif',
            'verdana': 'Libertinus Serif',
            'sans-serif': 'Libertinus Serif',
            'roboto': 'Libertinus Serif',
            'open sans': 'Libertinus Serif',
            'montserrat': 'Libertinus Serif',
            'outfit': 'Libertinus Serif',
            'system-ui': 'Libertinus Serif',
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
        cleanedFont = fontMap[cleanedFontLower] || 'Libertinus Serif';
        console.log(`[Typst] Mapped font "${fontFamily}" -> "${cleanedFont}"`);
    }

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
            const { createTypstCompiler, initOptions, loadFonts } = typstModule;
            
            // Get the preloadFontAssets function from initOptions namespace
            const preloadFontAssets = initOptions.preloadFontAssets;
            
            // Create the compiler
            typstCompiler = createTypstCompiler();
            
            // Prepare beforeBuild hooks
            const beforeBuildHooks: any[] = [
                // Load built-in text fonts (includes DejaVu Sans Mono, Libertinus Serif, New Computer Modern)
                preloadFontAssets({
                    assets: ['text'],
                })
            ];
            
            // Add custom fonts if any are pending
            if (pendingCustomFonts.length > 0) {
                console.log(`[Typst] [Client] Loading ${pendingCustomFonts.length} custom fonts...`);
                console.log(`[Typst] [Client] Font mapping:`, Array.from(registeredCustomFontFamilies.entries()));
                
                // Convert FontData to Uint8Array for loadFonts
                const customFontData = pendingCustomFonts.map(f => f.data);
                
                // Add custom fonts loader
                beforeBuildHooks.push(
                    loadFonts(customFontData, { assets: false })
                );
            }
            
            // Initialize with WASM from CDN and fonts
            await typstCompiler.init({
                getModule: () => {
                    const wasmUrl = `${CDN_BASE}/@myriaddreamin/typst-ts-web-compiler@${TYPST_VERSION}/pkg/typst_ts_web_compiler_bg.wasm`;
                    console.log('[Typst] [Client] Fetching WASM from:', wasmUrl);
                    return fetch(wasmUrl);
                },
                beforeBuild: beforeBuildHooks
            });
            
            isInitialized = true;
            console.log('[Typst] [Client] WASM compiler initialized successfully');
            console.log('[Typst] [Client] Built-in fonts: Libertinus Serif, DejaVu Sans Mono, New Computer Modern');
            
            if (registeredCustomFontFamilies.size > 0) {
                const fontList = Array.from(registeredCustomFontFamilies.entries())
                    .map(([user, internal]) => user === internal ? user : `${user} -> ${internal}`)
                    .join(', ');
                console.log(`[Typst] [Client] Custom fonts loaded: ${fontList}`);
            } else {
                console.log('[Typst] [Client] No custom fonts loaded');
            }
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

// Store pending custom fonts to be loaded on next init
let pendingCustomFonts: FontData[] = [];

/**
 * Register custom fonts to be loaded with the compiler
 * If compiler is already initialized, it will be reinitialized with the new fonts
 * @param fonts Array of font data with family name and binary data
 */
export async function setCustomFonts(fonts: FontData[]): Promise<void> {
    // Check if fonts have changed
    const currentFontIds = Array.from(loadedCustomFonts).sort().join(',');
    const newFontIds = fonts.map(f => `${f.family}-${f.data.length}`).sort().join(',');
    
    if (currentFontIds === newFontIds && isInitialized) {
        console.log('[Typst] [Client] Custom fonts unchanged, skipping reinit');
        return;
    }

    console.log(`[Typst] [Client] Setting ${fonts.length} custom fonts:`, fonts.map(f => f.family));

    // Update pending fonts
    pendingCustomFonts = fonts;
    
    // Pre-populate font family mapping by parsing font files NOW
    // This ensures generatePreamble can use the correct names even before init completes
    registeredCustomFontFamilies.clear();
    loadedCustomFonts.clear();
    
    for (const font of fonts) {
        const fontId = `${font.family}-${font.data.length}`;
        loadedCustomFonts.add(fontId);
        
        // Parse the internal font family name from the font file
        const internalName = parseFontFamilyName(font.data);
        if (internalName) {
            console.log(`[Typst] [Client] Pre-parsed font "${font.family}" -> internal: "${internalName}"`);
            registeredCustomFontFamilies.set(font.family, internalName);
        } else {
            console.log(`[Typst] [Client] Could not parse internal name for "${font.family}", using as-is`);
            registeredCustomFontFamilies.set(font.family, font.family);
        }
    }

    // If compiler is already initialized, we need to reinitialize to add new fonts
    if (isInitialized) {
        console.log('[Typst] [Client] Custom fonts changed, reinitializing compiler...');
        isInitialized = false;
        initPromise = null;
        typstCompiler = null;
        await initializeCompiler();
    }
}

/**
 * Get list of registered custom font family names (returns user-provided names)
 */
export function getRegisteredCustomFonts(): string[] {
    return Array.from(registeredCustomFontFamilies.keys());
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
            let errorMsg = diagnostics.map((d: any) => d.message || JSON.stringify(d)).join('\n') || 'Compilation failed';
            
            // Add helpful info about available fonts if there's a font error
            if (errorMsg.toLowerCase().includes('font')) {
                const availableFonts = ['Libertinus Serif', 'DejaVu Sans Mono', 'New Computer Modern'];
                const customFontsList = Array.from(registeredCustomFontFamilies.entries())
                    .map(([user, internal]) => `${user} (internal: ${internal})`);
                errorMsg += `\n\nAvailable built-in fonts: ${availableFonts.join(', ')}`;
                if (customFontsList.length > 0) {
                    errorMsg += `\nLoaded custom fonts: ${customFontsList.join(', ')}`;
                } else {
                    errorMsg += `\nNo custom fonts loaded.`;
                }
            }
            
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
