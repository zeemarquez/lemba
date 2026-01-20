import fs from 'fs';
import path from 'path';
import https from 'https';
import crypto from 'crypto';

export interface TypstImage {
    path: string;
    buffer: Buffer;
}

async function fetchImageBuffer(url: string): Promise<Buffer> {
    return new Promise((resolve, reject) => {
        https.get(url, (res) => {
            if (res.statusCode !== 200) {
                return reject(new Error(`Failed to download ${url}: ${res.statusCode}`));
            }
            const chunks: any[] = [];
            res.on('data', (chunk) => chunks.push(chunk));
            res.on('end', () => resolve(Buffer.concat(chunks)));
            res.on('error', (err) => reject(err));
        }).on('error', (err) => {
            reject(err);
        });
    });
}

export async function processTypstImages(typstSource: string): Promise<{ source: string, images: TypstImage[] }> {
    if (!typstSource) return { source: '', images: [] };

    // Regex to find #image("url"...)
    const imageRegex = /#image\("([^"]+)"/g;
    let match;
    let newSource = typstSource;
    const images: TypstImage[] = [];
    const urlToVirtualPath = new Map<string, string>();

    // Collect all unique image URLs
    const urls = new Set<string>();
    while ((match = imageRegex.exec(typstSource)) !== null) {
        urls.add(match[1]);
    }

    for (const url of urls) {
        try {
            let buffer: Buffer | null = null;
            let ext = '.png'; // Default

            if (url.startsWith('http://') || url.startsWith('https://')) {
                buffer = await fetchImageBuffer(url);
                const urlPath = url.split('?')[0];
                ext = path.extname(urlPath) || '.png';
            } else if (url.startsWith('/')) {
                const publicPath = path.join(process.cwd(), 'public', url);
                if (fs.existsSync(publicPath)) {
                    buffer = fs.readFileSync(publicPath);
                    ext = path.extname(publicPath) || '.png';
                }
            }

            if (buffer) {
                const hash = crypto.createHash('md5').update(url).digest('hex').slice(0, 12);
                const virtualPath = `/img/${hash}${ext}`;
                images.push({ path: virtualPath, buffer });
                urlToVirtualPath.set(url, virtualPath);
            }
        } catch (e) {
            console.error(`Failed to process image ${url}`, e);
        }
    }

    // Replace URLs in source with virtual paths
    for (const [url, vPath] of urlToVirtualPath.entries()) {
        // Use a more careful replacement to only replace inside #image quotes
        // Simple replaceAll on quoted string is usually safe for this specific source
        newSource = newSource.split(`"${url}"`).join(`"${vPath}"`);
    }

    return { source: newSource, images };
}
