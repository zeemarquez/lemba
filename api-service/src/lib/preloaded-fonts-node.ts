/**
 * Load the same Google-font TTFs the web app serves under `/fonts/preloaded/`.
 * Those files live in the monorepo at `public/fonts/preloaded` (see
 * `scripts/download-fonts.sh`). The API must register them with Typst so
 * templates that use e.g. "Inter" or "Open Sans" compile offline, matching
 * the web app.
 */

import fs from 'node:fs';
import fsPromises from 'node:fs/promises';
import path from 'node:path';
import type { FontInput } from './typst/fonts';

let cached: Promise<FontInput[]> | null = null;

function resolvePreloadedFontsDir(): string {
    const fromEnv = process.env.PRELOADED_FONTS_DIR?.trim();
    if (fromEnv) return path.resolve(fromEnv);

    // Prefer fonts copied into api-service (see `npm run copy-fonts`).
    const bundled = path.resolve(__dirname, '../../public/fonts/preloaded');
    if (fs.existsSync(bundled)) return bundled;

    // Monorepo dev: repo root `public/fonts/preloaded` without running copy.
    const monorepo = path.resolve(__dirname, '../../../public/fonts/preloaded');
    if (fs.existsSync(monorepo)) return monorepo;

    return bundled;
}

function familyFromTtfFileName(fileName: string): string {
    const base = fileName.replace(/\.ttf$/i, '');
    return base.replace(/_/g, ' ');
}

/**
 * Returns cached `FontInput[]` for all readable `*.ttf` files in the preloaded
 * directory. Missing directory or empty folder yields `[]` (logged once).
 */
export function getPreloadedFontInputs(): Promise<FontInput[]> {
    if (!cached) {
        cached = loadOnce();
    }
    return cached;
}

async function loadOnce(): Promise<FontInput[]> {
    const dir = resolvePreloadedFontsDir();
    let entries: string[];
    try {
        entries = await fsPromises.readdir(dir);
    } catch (e) {
        console.warn(
            `[Fonts] Preloaded fonts directory not readable (${dir}). ` +
                'Templates using those families may fail. Set PRELOADED_FONTS_DIR, run `npm run copy-fonts` from api-service, ' +
                'or run scripts/download-fonts.sh at repo root. ' +
                `Reason: ${(e as Error).message}`,
        );
        return [];
    }

    const ttfFiles = entries.filter((n) => /\.ttf$/i.test(n)).sort();
    if (ttfFiles.length === 0) {
        console.warn(`[Fonts] No .ttf files in ${dir}; preloaded font families unavailable.`);
        return [];
    }

    const out: FontInput[] = [];
    for (const file of ttfFiles) {
        const full = path.join(dir, file);
        try {
            const buf = await fsPromises.readFile(full);
            const data = new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
            if (data.byteLength === 0) continue;
            out.push({
                family: familyFromTtfFileName(file),
                data,
            });
        } catch (err) {
            console.warn(`[Fonts] Skipping preloaded font ${file}: ${(err as Error).message}`);
        }
    }

    console.log(`[Fonts] Loaded ${out.length} preloaded font(s) from ${dir}`);
    return out;
}

/** For tests / hot reload if directory contents change. */
export function clearPreloadedFontCache(): void {
    cached = null;
}
