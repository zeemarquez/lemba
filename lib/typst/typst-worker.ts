/**
 * Web Worker for Typst PDF compilation
 * Runs CPU-intensive compilation off the main thread to prevent UI freezing
 */

// Types for worker messages
export interface CompileRequest {
    type: 'compile';
    id: string;
    source: string;
    fonts?: FontDataTransfer[];
}

export interface InitRequest {
    type: 'init';
    id: string;
    fonts?: FontDataTransfer[];
}

export interface CancelRequest {
    type: 'cancel';
    id: string;
}

export interface FontDataTransfer {
    family: string;
    data: ArrayBuffer;
    internalName?: string;
}

export type WorkerRequest = CompileRequest | InitRequest | CancelRequest;

export interface CompileResponse {
    type: 'compile-result';
    id: string;
    success: boolean;
    pdf?: ArrayBuffer;
    error?: string;
}

export interface InitResponse {
    type: 'init-result';
    id: string;
    success: boolean;
    error?: string;
}

export interface ProgressResponse {
    type: 'progress';
    id: string;
    stage: 'initializing' | 'compiling' | 'processing-images';
    progress?: number;
}

export type WorkerResponse = CompileResponse | InitResponse | ProgressResponse;

// CDN URLs
const CDN_BASE = 'https://cdn.jsdelivr.net/npm';
const TYPST_VERSION = '0.7.0-rc2';

// Compiler state
let typstCompiler: any = null;
let isInitialized = false;
let initPromise: Promise<void> | null = null;
let currentCompilationId: string | null = null;

// Custom font families that have been registered
const registeredCustomFontFamilies = new Map<string, string>();
let pendingCustomFonts: { family: string; data: Uint8Array; internalName?: string }[] = [];
// Track loaded font signature to detect changes
let loadedFontSignature: string = '';

/**
 * Parse font family name from TTF/OTF/WOFF font file
 */
function parseFontFamilyName(data: Uint8Array): string | null {
    try {
        const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
        const signature = view.getUint32(0, false);
        const isTTF = signature === 0x00010000 || signature === 0x74727565;
        const isOTF = signature === 0x4F54544F;
        const isWOFF = signature === 0x774F4646;
        const isWOFF2 = signature === 0x774F4632;

        if (!isTTF && !isOTF && !isWOFF && !isWOFF2) {
            return null;
        }

        let numTables: number;
        let tableOffset: number;
        let tableEntrySize: number;

        if (isWOFF) {
            numTables = view.getUint16(12, false);
            tableOffset = 44;
            tableEntrySize = 20;
        } else if (isWOFF2) {
            return null;
        } else {
            numTables = view.getUint16(4, false);
            tableOffset = 12;
            tableEntrySize = 16;
        }

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
                    nameTableOffset = view.getUint32(entryOffset + 4, false);
                    nameTableCompLength = view.getUint32(entryOffset + 8, false);
                    nameTableOrigLength = view.getUint32(entryOffset + 12, false);
                } else {
                    nameTableOffset = view.getUint32(entryOffset + 8, false);
                }
                break;
            }
        }

        if (nameTableOffset === 0) return null;
        if (isWOFF && nameTableCompLength !== nameTableOrigLength) return null;

        const nameCount = view.getUint16(nameTableOffset + 2, false);
        const stringOffset = view.getUint16(nameTableOffset + 4, false);
        let fallbackName: string | null = null;

        for (let i = 0; i < nameCount; i++) {
            const recordOffset = nameTableOffset + 6 + i * 12;
            const platformID = view.getUint16(recordOffset, false);
            const encodingID = view.getUint16(recordOffset + 2, false);
            const nameID = view.getUint16(recordOffset + 6, false);
            const length = view.getUint16(recordOffset + 8, false);
            const offset = view.getUint16(recordOffset + 10, false);

            if (nameID === 1) {
                const strOffset = nameTableOffset + stringOffset + offset;
                if (platformID === 3 && encodingID === 1) {
                    let name = '';
                    for (let j = 0; j < length; j += 2) {
                        name += String.fromCharCode(view.getUint16(strOffset + j, false));
                    }
                    if (name) return name;
                } else if (platformID === 1 && encodingID === 0) {
                    let name = '';
                    for (let j = 0; j < length; j++) {
                        name += String.fromCharCode(view.getUint8(strOffset + j));
                    }
                    if (name && !fallbackName) fallbackName = name;
                }
            }
        }
        return fallbackName;
    } catch {
        return null;
    }
}

/**
 * Initialize the Typst WASM compiler
 * @param fonts - If provided (including empty array), update fonts. If undefined, just ensure initialized.
 */
async function initializeCompiler(fonts?: FontDataTransfer[]): Promise<void> {
    // Only check for font changes if fonts are EXPLICITLY provided (not undefined)
    // This distinguishes between:
    // - initializeCompiler() - just ensure compiler is ready, don't change fonts
    // - initializeCompiler([]) or initializeCompiler([...]) - explicitly set fonts
    const fontsProvided = fonts !== undefined;
    const newFontSignature = fontsProvided 
        ? fonts.map(f => `${f.family}-${f.data.byteLength}`).sort().join(',')
        : null;
    
    if (fontsProvided) {
        const fontsChanged = loadedFontSignature !== newFontSignature;
        
        if (isInitialized && typstCompiler && !fontsChanged) {
            console.log('[TypstWorker] Already initialized with same fonts, skipping');
            return;
        }
        
        // If fonts changed and we were already initialized, we need to reinitialize
        if (isInitialized && fontsChanged) {
            console.log('[TypstWorker] Fonts changed, reinitializing compiler...');
            console.log('[TypstWorker] Old signature:', loadedFontSignature);
            console.log('[TypstWorker] New signature:', newFontSignature);
            isInitialized = false;
            initPromise = null;
            typstCompiler = null;
            registeredCustomFontFamilies.clear();
            pendingCustomFonts = [];
        }
        // Update the target signature (for both first init and reinit with fonts)
        loadedFontSignature = newFontSignature!;
    } else {
        // fonts === undefined: Just ensure compiler is initialized, don't change fonts
        if (isInitialized && typstCompiler) {
            return;
        }
    }
    
    if (initPromise) return initPromise;

    initPromise = (async () => {
        try {
            console.log('[TypstWorker] Initializing WASM compiler...');

            const typstModule = await import('@myriaddreamin/typst.ts');
            const { createTypstCompiler, initOptions, loadFonts } = typstModule;
            const preloadFontAssets = initOptions.preloadFontAssets;

            typstCompiler = createTypstCompiler();

            // Process fonts if provided
            if (fonts && fonts.length > 0) {
                pendingCustomFonts = fonts.map(f => ({
                    family: f.family,
                    data: new Uint8Array(f.data),
                    internalName: f.internalName
                }));

                registeredCustomFontFamilies.clear();
                for (const font of pendingCustomFonts) {
                    const internalName = font.internalName || parseFontFamilyName(font.data) || font.family;
                    registeredCustomFontFamilies.set(font.family, internalName);
                }
            }

            const beforeBuildHooks: any[] = [
                preloadFontAssets({ assets: ['text'] })
            ];

            if (pendingCustomFonts.length > 0) {
                const customFontData = pendingCustomFonts.map(f => f.data);
                beforeBuildHooks.push(loadFonts(customFontData, { assets: false }));
            }

            await typstCompiler.init({
                getModule: () => {
                    const wasmUrl = `${CDN_BASE}/@myriaddreamin/typst-ts-web-compiler@${TYPST_VERSION}/pkg/typst_ts_web_compiler_bg.wasm`;
                    return fetch(wasmUrl);
                },
                beforeBuild: beforeBuildHooks
            });

            isInitialized = true;
            // If no fonts were provided (first init without explicit fonts), compute signature from pendingCustomFonts
            if (!fontsProvided) {
                loadedFontSignature = pendingCustomFonts.map(f => `${f.family}-${f.data.byteLength}`).sort().join(',');
            }
            console.log('[TypstWorker] WASM compiler initialized successfully');
            console.log('[TypstWorker] Font signature:', loadedFontSignature || '(none)');
            if (pendingCustomFonts.length > 0) {
                console.log('[TypstWorker] Custom fonts loaded:', pendingCustomFonts.map(f => f.family));
            }
        } catch (error) {
            console.error('[TypstWorker] Failed to initialize compiler:', error);
            initPromise = null;
            throw error;
        }
    })();

    return initPromise;
}

/**
 * Process data URLs in the source and add them as shadow files
 */
function processDataUrlsToShadow(source: string, compiler: any): string {
    const dataUrlRegex = /image\s*\(\s*["'](data:image\/[^"']+)["']/g;
    let match;
    let newSource = source;
    let imageIndex = 0;
    const replacements: [string, string][] = [];

    dataUrlRegex.lastIndex = 0;

    while ((match = dataUrlRegex.exec(source)) !== null) {
        const dataUrl = match[1];

        let ext = '.png';
        if (dataUrl.includes('image/jpeg') || dataUrl.includes('image/jpg')) ext = '.jpg';
        else if (dataUrl.includes('image/gif')) ext = '.gif';
        else if (dataUrl.includes('image/webp')) ext = '.webp';
        else if (dataUrl.includes('image/svg')) ext = '.svg';

        const virtualPath = `/image_${imageIndex++}${ext}`;

        try {
            const commaIndex = dataUrl.indexOf(',');
            if (commaIndex !== -1) {
                const base64Data = dataUrl.substring(commaIndex + 1);
                const binaryString = atob(base64Data);
                const bytes = new Uint8Array(binaryString.length);
                for (let i = 0; i < binaryString.length; i++) {
                    bytes[i] = binaryString.charCodeAt(i);
                }

                compiler.mapShadow(virtualPath, bytes);
                replacements.push([dataUrl, virtualPath]);
            }
        } catch (e) {
            console.error('[TypstWorker] Failed to process data URL:', e);
        }
    }

    for (const [dataUrl, virtualPath] of replacements) {
        newSource = newSource.split(`"${dataUrl}"`).join(`"${virtualPath}"`);
        newSource = newSource.split(`'${dataUrl}'`).join(`'${virtualPath}'`);
    }

    return newSource;
}

/**
 * Compile Typst source to PDF
 */
async function compileTypstToPdf(source: string, compilationId: string): Promise<Uint8Array> {
    await initializeCompiler();

    if (!typstCompiler) {
        throw new Error('Typst compiler not initialized');
    }

    // Check if this compilation was cancelled
    if (currentCompilationId !== compilationId) {
        throw new Error('Compilation cancelled');
    }

    try {
        typstCompiler.resetShadow();
        const processedSource = processDataUrlsToShadow(source, typstCompiler);
        typstCompiler.addSource('/main.typ', processedSource);

        // Check again before expensive operation
        if (currentCompilationId !== compilationId) {
            throw new Error('Compilation cancelled');
        }

        const result = await typstCompiler.compile({
            mainFilePath: '/main.typ',
            format: 1 // PDF format
        });

        if (!result.result) {
            const diagnostics = result.diagnostics || [];
            let errorMsg = diagnostics.map((d: any) => d.message || JSON.stringify(d)).join('\n') || 'Compilation failed';
            throw new Error(errorMsg);
        }

        const pdfData = result.result;
        if (!pdfData || pdfData.length === 0) {
            throw new Error('Typst returned an empty PDF buffer.');
        }

        return pdfData;
    } catch (error) {
        throw error;
    }
}

// Handle messages from main thread
self.onmessage = async (event: MessageEvent<WorkerRequest>) => {
    const request = event.data;

    switch (request.type) {
        case 'init': {
            try {
                self.postMessage({
                    type: 'progress',
                    id: request.id,
                    stage: 'initializing'
                } as ProgressResponse);

                await initializeCompiler(request.fonts);

                self.postMessage({
                    type: 'init-result',
                    id: request.id,
                    success: true
                } as InitResponse);
            } catch (error: any) {
                self.postMessage({
                    type: 'init-result',
                    id: request.id,
                    success: false,
                    error: error.message || 'Failed to initialize compiler'
                } as InitResponse);
            }
            break;
        }

        case 'compile': {
            currentCompilationId = request.id;
            
            try {
                self.postMessage({
                    type: 'progress',
                    id: request.id,
                    stage: 'compiling'
                } as ProgressResponse);

                // Initialize with fonts if provided and not yet initialized
                if (request.fonts && request.fonts.length > 0 && !isInitialized) {
                    await initializeCompiler(request.fonts);
                }

                const pdfData = await compileTypstToPdf(request.source, request.id);

                // Only send result if not cancelled
                if (currentCompilationId === request.id) {
                    self.postMessage({
                        type: 'compile-result',
                        id: request.id,
                        success: true,
                        pdf: pdfData.buffer
                    } as CompileResponse, { transfer: [pdfData.buffer as ArrayBuffer] });
                }
            } catch (error: any) {
                // Only send error if not cancelled
                if (currentCompilationId === request.id) {
                    self.postMessage({
                        type: 'compile-result',
                        id: request.id,
                        success: false,
                        error: error.message || 'Compilation failed'
                    } as CompileResponse);
                }
            }
            break;
        }

        case 'cancel': {
            if (currentCompilationId === request.id) {
                currentCompilationId = null;
                console.log('[TypstWorker] Compilation cancelled:', request.id);
            }
            break;
        }
    }
};

// Export types for use in main thread
export {};
