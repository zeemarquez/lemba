'use strict';

/**
 * Copies `<repo>/public/fonts` into `<api-service>/public/fonts` so the API
 * can load preloaded TTFs without depending on the monorepo layout at runtime.
 *
 * Run from anywhere: `node api-service/scripts/copy-fonts.cjs`
 * Or from api-service: `npm run copy-fonts`
 */

const fs = require('fs').promises;
const path = require('path');

const scriptDir = __dirname;
const apiServiceRoot = path.join(scriptDir, '..');
const repoRoot = path.join(apiServiceRoot, '..');
const src = path.join(repoRoot, 'public', 'fonts');
const dest = path.join(apiServiceRoot, 'public', 'fonts');

async function main() {
    try {
        await fs.access(src);
    } catch {
        console.warn(`[copy-fonts] Source not found (skip): ${src}`);
        process.exit(0);
    }

    await fs.mkdir(path.dirname(dest), { recursive: true });
    await fs.cp(src, dest, { recursive: true, force: true });
    console.log(`[copy-fonts] Copied:\n  ${src}\n  -> ${dest}`);
}

main().catch((err) => {
    console.error('[copy-fonts] Failed:', err);
    process.exit(1);
});
