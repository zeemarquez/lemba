/**
 * Public web app URL for opening a vault file by Firestore document id (`syncId` / API `fileId`).
 * @see app/[fileId]/page.tsx in the web app
 */

const DEFAULT_WEBAPP_BASE = 'https://write.lemba.app';

export function buildWebappFileDeepLink(fileId: string): string {
    const raw = process.env.WEBAPP_BASE_URL || DEFAULT_WEBAPP_BASE;
    const base = raw.replace(/\/+$/, '');
    return `${base}/${encodeURIComponent(fileId.trim())}`;
}
