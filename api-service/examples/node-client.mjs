// Node 18+ — uses global `fetch` and `Blob`.
//
// Run with:
//   node examples/node-client.mjs

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const API_BASE = process.env.API_BASE || 'http://localhost:4000';

async function main() {
    const markdown = await fs.readFile(path.join(__dirname, 'sample.md'), 'utf8');
    const templatePath = path.join(__dirname, '..', '..', 'public', 'preloaded', 'Default Templates', 'Modern.mdt');
    const template = JSON.parse(await fs.readFile(templatePath, 'utf8'));

    const response = await fetch(`${API_BASE}/v1/convert`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            markdown,
            template,
            title: 'Quarterly Report',
            variables: { author: 'Jane Doe', project: 'Modern Markdown Editor' },
            fonts: [
                { family: 'Inter', url: 'https://github.com/rsms/inter/raw/master/docs/font-files/Inter-Regular.ttf' },
            ],
        }),
    });

    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`HTTP ${response.status}: ${errorText}`);
    }

    const buffer = Buffer.from(await response.arrayBuffer());
    const outPath = path.join(__dirname, 'report.pdf');
    await fs.writeFile(outPath, buffer);
    console.log(`Wrote ${outPath} (${buffer.length.toLocaleString()} bytes)`);
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
