/**
 * Server-side port of `lib/typst/client-image-manager.ts`.
 *
 * The browser version handles `blob:`, `indexeddb://`, and `http(s)://`
 * URLs by reading from the page-bound IndexedDB and the FileReader API.
 * In the API service we only see whatever the client uploads, so we
 * support the subset of URL schemes that make sense on a server:
 *   - http(s)://...   (downloaded)
 *   - data:image/...  (passed through)
 *
 * Anything else is replaced with a small "image not found" placeholder
 * so a malformed input never breaks compilation.
 */

const IMAGE_FETCH_TIMEOUT_MS = Number(process.env.IMAGE_FETCH_TIMEOUT_MS || 15000);

function buildTwemojiFallbackUrls(url: string): string[] {
    const matches = url.match(/^(https:\/\/cdn\.jsdelivr\.net\/gh\/twitter\/twemoji@14\.0\.2\/assets\/svg\/)([0-9a-f-]+)(\.svg)$/i);
    if (!matches) return [url];
    const [, prefix, codePointPart, suffix] = matches;
    const baseCodePoints = codePointPart.split('-').map(cp => cp.toLowerCase()).filter(Boolean);
    if (baseCodePoints.length === 0) return [url];

    const variants = new Set<string>();
    variants.add(baseCodePoints.join('-'));
    if (baseCodePoints.length === 1 && baseCodePoints[0] !== 'fe0f') {
        variants.add(`${baseCodePoints[0]}-fe0f`);
    }
    if (baseCodePoints.includes('fe0f')) {
        const withoutFe0f = baseCodePoints.filter(cp => cp !== 'fe0f');
        if (withoutFe0f.length > 0) variants.add(withoutFe0f.join('-'));
    }
    return Array.from(variants).map(variant => `${prefix}${variant}${suffix}`);
}

async function fetchImageAsDataUrl(url: string): Promise<string | null> {
    const candidates = buildTwemojiFallbackUrls(url);

    for (let i = 0; i < candidates.length; i++) {
        const candidateUrl = candidates[i];
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), IMAGE_FETCH_TIMEOUT_MS);

        try {
            const response = await fetch(candidateUrl, {
                headers: {
                    'User-Agent': 'modern-markdown-editor-api/0.1 (+https://github.com/zeemarquez/modern-markdown-editor)'
                },
                signal: controller.signal,
            });

            if (!response.ok) {
                if (i < candidates.length - 1) continue;
                console.error(`[ImageManager] Failed ${url}: ${response.status} ${response.statusText}`);
                return null;
            }

            const mime = response.headers.get('content-type') || guessMimeFromUrl(candidateUrl);
            const arrayBuf = await response.arrayBuffer();
            const base64 = Buffer.from(arrayBuf).toString('base64');
            return `data:${mime};base64,${base64}`;
        } catch (e) {
            console.error(`[ImageManager] Error fetching ${candidateUrl}:`, (e as Error).message);
            if (i === candidates.length - 1) return null;
        } finally {
            clearTimeout(timer);
        }
    }
    return null;
}

function guessMimeFromUrl(url: string): string {
    const u = url.toLowerCase();
    if (u.endsWith('.png')) return 'image/png';
    if (u.endsWith('.jpg') || u.endsWith('.jpeg')) return 'image/jpeg';
    if (u.endsWith('.gif')) return 'image/gif';
    if (u.endsWith('.webp')) return 'image/webp';
    if (u.endsWith('.svg')) return 'image/svg+xml';
    return 'application/octet-stream';
}

function generatePlaceholderImageDataUrl(): string {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="120" viewBox="0 0 200 120">
        <rect width="200" height="120" fill="#f0f0f0" stroke="#ccc" stroke-width="1"/>
        <path d="M60 50 L80 70 L95 55 L120 85 L80 85 L60 60 Z" fill="#ccc"/>
        <circle cx="130" cy="45" r="12" fill="#ccc"/>
        <text x="100" y="105" text-anchor="middle" font-family="sans-serif" font-size="11" fill="#888">Could not find image</text>
    </svg>`;
    const base64 = Buffer.from(svg, 'utf8').toString('base64');
    return `data:image/svg+xml;base64,${base64}`;
}

export interface ProcessTypstImagesResult {
    source: string;
}

/**
 * Walk the Typst source, replacing every `image("...")` URL with an inline
 * data URL. The WASM compiler cannot perform network requests, so all
 * remote resources must be inlined ahead of compilation.
 */
export async function processTypstImages(typstSource: string): Promise<ProcessTypstImagesResult> {
    if (!typstSource) return { source: '' };

    const imageRegex = /image\s*\(\s*["']([^"']+)["']/g;
    const rawUrls = new Set<string>();
    let match: RegExpExecArray | null;
    while ((match = imageRegex.exec(typstSource)) !== null) {
        if (match[1]) rawUrls.add(match[1]);
    }
    if (rawUrls.size === 0) return { source: typstSource };

    const urlToDataUrl = new Map<string, string>();
    for (const rawUrl of rawUrls) {
        try {
            const url = rawUrl.replace(/\\\\/g, '\\').replace(/\\"/g, '"');
            let dataUrl: string | null = null;

            if (url.startsWith('data:')) {
                continue;
            } else if (url.startsWith('http://') || url.startsWith('https://')) {
                dataUrl = await fetchImageAsDataUrl(url);
            } else {
                console.warn(`[ImageManager] Unsupported URL scheme: ${url.substring(0, 80)}`);
                dataUrl = generatePlaceholderImageDataUrl();
            }

            urlToDataUrl.set(rawUrl, dataUrl ?? generatePlaceholderImageDataUrl());
        } catch (e) {
            console.error(`[ImageManager] Failed processing ${rawUrl}:`, (e as Error).message);
            urlToDataUrl.set(rawUrl, generatePlaceholderImageDataUrl());
        }
    }

    let newSource = typstSource;
    for (const [rawUrl, dataUrl] of urlToDataUrl.entries()) {
        const dq = `"${rawUrl}"`;
        const sq = `'${rawUrl}'`;
        if (newSource.indexOf(dq) !== -1) newSource = newSource.split(dq).join(`"${dataUrl}"`);
        if (newSource.indexOf(sq) !== -1) newSource = newSource.split(sq).join(`'${dataUrl}'`);
    }

    return { source: newSource };
}
