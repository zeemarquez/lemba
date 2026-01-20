'use client';

/**
 * Fetch an image from URL and return as base64 data URL
 */
async function fetchImageAsDataUrl(url: string): Promise<string | null> {
    try {
        const response = await fetch(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            }
        });
        
        if (!response.ok) {
            console.error(`Failed to download ${url}: ${response.status} ${response.statusText}`);
            return null;
        }
        
        const blob = await response.blob();
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result as string);
            reader.onerror = reject;
            reader.readAsDataURL(blob);
        });
    } catch (e) {
        console.error(`[Typst] [ImageManager] Failed to fetch ${url}:`, e);
        return null;
    }
}

/**
 * Convert a blob URL to a base64 data URL
 */
async function blobUrlToDataUrl(blobUrl: string): Promise<string | null> {
    try {
        const response = await fetch(blobUrl);
        const blob = await response.blob();
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result as string);
            reader.onerror = reject;
            reader.readAsDataURL(blob);
        });
    } catch (e) {
        console.error(`[Typst] [ImageManager] Failed to fetch blob URL:`, e);
        return null;
    }
}

export interface ProcessTypstImagesResult {
    source: string;
    images: never[]; // We no longer use separate image array, all embedded as data URLs
}

/**
 * Process Typst source to convert image URLs to data URLs
 * This is needed because the WASM compiler cannot fetch external URLs
 */
export async function processTypstImages(typstSource: string): Promise<ProcessTypstImagesResult> {
    if (!typstSource) return { source: '', images: [] };

    // Regex to find image("url"...) or #image("url"...)
    const imageRegex = /image\s*\(\s*["']([^"']+)["']/g;
    let match;
    let newSource = typstSource;
    const urlToDataUrl = new Map<string, string>();

    // 1. Scan for all image calls
    const rawUrls = new Set<string>();
    while ((match = imageRegex.exec(typstSource)) !== null) {
        if (match[1]) rawUrls.add(match[1]);
    }

    if (rawUrls.size === 0) {
        console.log('[Typst] [ImageManager] No image() calls found.');
        return { source: typstSource, images: [] };
    }

    console.log(`[Typst] [ImageManager] Found ${rawUrls.size} unique image strings in Typst source.`);

    for (const rawUrl of rawUrls) {
        try {
            // Unescape the URL for processing
            const url = rawUrl.replace(/\\\\/g, '\\').replace(/\\"/g, '"');

            let dataUrl: string | null = null;

            // Already a data URL - no conversion needed
            if (url.startsWith('data:')) {
                console.log('[Typst] [ImageManager] Image is already a data URL');
                continue;
            }

            if (url.startsWith('http://') || url.startsWith('https://')) {
                console.log(`[Typst] [ImageManager] Fetching: ${url}`);
                dataUrl = await fetchImageAsDataUrl(url);
            } else if (url.startsWith('blob:')) {
                console.log('[Typst] [ImageManager] Converting blob URL to data URL');
                dataUrl = await blobUrlToDataUrl(url);
            } else {
                // Local/relative paths - these won't work in browser context
                console.warn(`[Typst] [ImageManager] Cannot handle local path in browser: ${url}`);
                continue;
            }

            if (dataUrl) {
                urlToDataUrl.set(rawUrl, dataUrl);
                console.log(`[Typst] [ImageManager] SUCCESS: Converted ${url.substring(0, 50)}... to data URL`);
            }
        } catch (e) {
            console.error(`[Typst] [ImageManager] ERROR processing ${rawUrl}:`, e);
        }
    }

    // 2. Replace URLs in source with data URLs
    let replaceCount = 0;
    for (const [rawUrl, dataUrl] of urlToDataUrl.entries()) {
        const searchDouble = `"${rawUrl}"`;
        const searchSingle = `'${rawUrl}'`;

        let found = false;
        if (newSource.indexOf(searchDouble) !== -1) {
            newSource = newSource.split(searchDouble).join(`"${dataUrl}"`);
            found = true;
        }
        if (newSource.indexOf(searchSingle) !== -1) {
            newSource = newSource.split(searchSingle).join(`'${dataUrl}'`);
            found = true;
        }

        if (found) {
            replaceCount++;
        }
    }

    console.log(`[Typst] [ImageManager] Replaced ${replaceCount} image URLs with data URLs`);

    return { source: newSource, images: [] };
}
