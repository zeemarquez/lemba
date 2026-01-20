import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

export interface TypstImage {
    path: string;
    buffer: Buffer;
}

async function fetchImageBuffer(url: string): Promise<Buffer> {
    const response = await fetch(url, {
        headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        }
    });
    if (!response.ok) {
        throw new Error(`Failed to download ${url}: ${response.status} ${response.statusText}`);
    }
    const arrayBuffer = await response.arrayBuffer();
    return Buffer.from(arrayBuffer);
}

export async function processTypstImages(typstSource: string): Promise<{ source: string, images: TypstImage[] }> {
    if (!typstSource) return { source: '', images: [] };

    // Regex to find image("url"...) or #image("url"...)
    // Supports single or double quotes and handles whitespace
    const imageRegex = /image\s*\(\s*["']([^"']+)["']/g;
    let match;
    let newSource = typstSource;
    const images: TypstImage[] = [];
    const urlToVirtualPath = new Map<string, string>();

    // 1. Scan for all image calls
    const rawUrls = new Set<string>();
    while ((match = imageRegex.exec(typstSource)) !== null) {
        if (match[1]) rawUrls.add(match[1]);
    }

    if (rawUrls.size > 0) {
        console.log(`[Typst] [ImageManager] Found ${rawUrls.size} unique image strings in Typst source.`);
    } else {
        console.log(`[Typst] [ImageManager] No image() calls found.`);
        return { source: typstSource, images: [] };
    }

    const projectRoot = process.cwd();

    for (const rawUrl of rawUrls) {
        try {
            // Unescape the URL for processing (Typst strings use \\ for \)
            const url = rawUrl.replace(/\\\\/g, '\\').replace(/\\"/g, '"');

            let buffer: Buffer | null = null;
            let ext = '.png';

            if (url.startsWith('http://') || url.startsWith('https://')) {
                console.log(`[Typst] [ImageManager] Fetching: ${url}`);
                buffer = await fetchImageBuffer(url);
                const urlPath = url.split('?')[0];
                ext = path.extname(urlPath) || '.png';
            } else if (url.startsWith('data:')) {
                console.log('[Typst] [ImageManager] Decoding data URL');
                const [header, base64Data] = url.split(',');
                if (base64Data) {
                    buffer = Buffer.from(base64Data, 'base64');
                    const mimeMatch = header.match(/data:image\/([^;]+)/);
                    if (mimeMatch) {
                        ext = `.${mimeMatch[1]}`;
                        if (ext === '.webp') {
                            console.warn('[Typst] [ImageManager] WARNING: WebP images might not be supported by old Typst versions.');
                        }
                    }
                }
            } else if (url.startsWith('blob:')) {
                console.error(`[Typst] [ImageManager] Server cannot access blob URL: ${url}`);
            } else {
                // Local file handling
                let localPath = url;
                if (url.startsWith('/')) {
                    localPath = path.join(projectRoot, 'public', url);
                } else if (!path.isAbsolute(url)) {
                    const p1 = path.join(projectRoot, 'public', url);
                    const p2 = path.join(projectRoot, url);
                    localPath = fs.existsSync(p1) ? p1 : p2;
                }

                if (fs.existsSync(localPath) && fs.statSync(localPath).isFile()) {
                    console.log(`[Typst] [ImageManager] Reading: ${localPath}`);
                    buffer = fs.readFileSync(localPath);
                    ext = path.extname(localPath) || '.png';
                } else {
                    console.warn(`[Typst] [ImageManager] File not found: ${localPath}`);
                }
            }

            if (buffer && buffer.length > 0) {
                const hash = crypto.createHash('md5').update(url).digest('hex').slice(0, 12);
                const virtualPath = `assets/img_${hash}${ext}`;
                images.push({ path: virtualPath, buffer });
                urlToVirtualPath.set(rawUrl, virtualPath);
                console.log(`[Typst] [ImageManager] SUCCESS: Mapped ${url.substring(0, 50)}... to ${virtualPath}`);
            }
        } catch (e) {
            console.error(`[Typst] [ImageManager] ERROR processing ${rawUrl}:`, e);
        }
    }

    // 2. Replace URLs in source
    let replaceCount = 0;
    for (const [rawUrl, vPath] of urlToVirtualPath.entries()) {
        const searchDouble = `"${rawUrl}"`;
        const searchSingle = `'${rawUrl}'`;

        let found = false;
        if (newSource.indexOf(searchDouble) !== -1) {
            newSource = newSource.split(searchDouble).join(`"${vPath}"`);
            found = true;
        }
        if (newSource.indexOf(searchSingle) !== -1) {
            newSource = newSource.split(searchSingle).join(`'${vPath}'`);
            found = true;
        }

        if (found) {
            replaceCount++;
            console.log(`[Typst] [ImageManager] Replaced path: ${rawUrl.substring(0, 30)}... -> ${vPath}`);
        } else {
            console.warn(`[Typst] [ImageManager] Could not find ${rawUrl} to replace in source.`);
        }
    }

    // Final sanity check
    const finalMatches = newSource.match(/image\s*\(\s*["']([^"']+)["']/g) || [];
    console.log(`[Typst] [ImageManager] Final source images:`, finalMatches);

    return { source: newSource, images };
}
