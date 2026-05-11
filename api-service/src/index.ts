/**
 * Local / container entry: listen on PORT.
 * On Vercel, traffic is handled by `api/index.ts` — this file is not used as the entry.
 */

import { getApp } from './app';

const PORT = Number(process.env.PORT || 4000);
const HOST = process.env.HOST || '0.0.0.0';

const app = getApp();

app.listen(PORT, HOST, () => {
    console.log(`[api] modern-markdown-editor-api listening on http://${HOST}:${PORT}`);
    if (process.env.API_KEY) {
        console.log('[api] API key auth ENABLED (set via API_KEY env var)');
    } else {
        console.log('[api] API key auth DISABLED (set API_KEY env var to enable)');
    }
});
