/**
 * Helpers for loading custom fonts from URLs and registering them with the
 * Typst compiler. Mirrors the behaviour of `use-custom-fonts.ts` /
 * `use-pdf-compiler.ts` from the main app, but adapted for a stateless API.
 */

import { setCustomFonts, FontData } from './compiler';

export interface FontInput {
    /**
     * Font family name used in the document/template settings (e.g. "Inter").
     * If omitted, the family is inferred from the font file's internal
     * `name` table by the compiler.
     */
    family?: string;
    /** Public HTTP(S) URL to a TTF / OTF / WOFF font file. */
    url?: string;
    /** Raw bytes of a font file (for multipart uploads). */
    data?: Uint8Array;
}

const FONT_FETCH_TIMEOUT_MS = Number(process.env.FONT_FETCH_TIMEOUT_MS || 15000);

async function downloadFont(url: string): Promise<Uint8Array> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FONT_FETCH_TIMEOUT_MS);
    try {
        const response = await fetch(url, {
            headers: {
                'User-Agent': 'modern-markdown-editor-api/0.1',
                'Accept': 'font/ttf, font/otf, font/woff, application/font-woff, application/octet-stream, */*',
            },
            signal: controller.signal,
        });
        if (!response.ok) {
            throw new Error(`Failed to download font from ${url}: ${response.status} ${response.statusText}`);
        }
        const buf = await response.arrayBuffer();
        return new Uint8Array(buf);
    } finally {
        clearTimeout(timer);
    }
}

function familyFromUrl(url: string): string {
    try {
        const u = new URL(url);
        const last = u.pathname.split('/').pop() || 'CustomFont';
        return last.replace(/\.[^/.]+$/, '') || 'CustomFont';
    } catch {
        return 'CustomFont';
    }
}

/**
 * Resolve a heterogeneous list of font inputs to a flat list of `FontData`
 * objects ready to register with the compiler.
 */
export async function resolveFonts(inputs: FontInput[] = []): Promise<FontData[]> {
    if (!inputs.length) return [];

    const fontData: FontData[] = await Promise.all(
        inputs.map(async (input): Promise<FontData | null> => {
            try {
                if (input.data && input.data.length > 0) {
                    return {
                        family: input.family || 'CustomFont',
                        data: input.data,
                    };
                }
                if (input.url) {
                    const data = await downloadFont(input.url);
                    return {
                        family: input.family || familyFromUrl(input.url),
                        data,
                    };
                }
                return null;
            } catch (e) {
                console.error(`[Fonts] Failed to load font:`, (e as Error).message);
                return null;
            }
        })
    ).then(arr => arr.filter((f): f is FontData => f !== null && f.data.length > 0));

    return fontData;
}

/**
 * Convenience helper used by the API route: resolve inputs and register
 * them on the compiler. Always call this before compiling so that the
 * preamble can map the user-provided family to the font's internal name.
 */
export async function registerFonts(inputs: FontInput[] = []): Promise<FontData[]> {
    const fontData = await resolveFonts(inputs);
    await setCustomFonts(fontData);
    return fontData;
}
