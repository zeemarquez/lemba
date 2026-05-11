/**
 * Local smoke test: spin up the converter directly (no HTTP) and write a
 * PDF to disk. Useful to validate the conversion pipeline without
 * starting the Express server.
 *
 *   npm run smoke
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { convertMarkdownToPdf } from '../src/lib/converter';

async function main() {
    const root = path.resolve(__dirname, '..', '..');
    const markdown = await fs.readFile(path.join(__dirname, '..', 'examples', 'sample.md'), 'utf8');
    const template = JSON.parse(
        await fs.readFile(path.join(root, 'public', 'preloaded', 'Default Templates', 'Basic.mdt'), 'utf8'),
    );

    const { pdf } = await convertMarkdownToPdf({
        markdown,
        template,
        title: 'Smoke Test',
        variables: { author: 'Smoke Tester', project: 'API Service' },
    });

    const out = path.join(__dirname, '..', 'examples', 'smoke-output.pdf');
    await fs.writeFile(out, Buffer.from(pdf));
    console.log(`OK — wrote ${out} (${pdf.byteLength.toLocaleString()} bytes)`);
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
