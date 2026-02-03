/**
 * Version History Service
 * Time-based version creation with spaced retention.
 */

import { browserStorage } from './browser-storage';
import type { VersionEntry } from './browser-storage';

const PERIODIC_INTERVAL_MS = 60 * 1000; // 1 minute
const MAX_VERSIONS_PER_FILE = 10;
const RETENTION_INTERVALS_MS = [
    1 * 60 * 1000,
    5 * 60 * 1000,
    15 * 60 * 1000,
    30 * 60 * 1000,
    45 * 60 * 1000,
    60 * 60 * 1000,
    2 * 60 * 60 * 1000,
    4 * 60 * 60 * 1000,
    8 * 60 * 60 * 1000,
];

function countWords(text: string): number {
    return text.split(/\s+/).filter((w) => w.length > 0).length;
}

function hashString(str: string): string {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        const char = str.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash;
    }
    return Math.abs(hash).toString(36);
}

const lastVersionByFile = new Map<
    string,
    { content: string; wordCount: number; createdAt: number }
>();

/**
 * Check if we should create a version and create one if so.
 * Time-based only; do not create if content is unchanged.
 */
export async function maybeCreateVersion(fileId: string, content: string): Promise<void> {
    const last = lastVersionByFile.get(fileId);
    if (!content) return;

    if (!last) {
        await createVersion(fileId, content);
        return;
    }

    if (content === last.content) return;
    const timeSinceLastVersion = Date.now() - last.createdAt;
    if (timeSinceLastVersion >= PERIODIC_INTERVAL_MS) {
        await createVersion(fileId, content);
    }
}

/**
 * Create a version entry and store it.
 */
export async function createVersion(
    fileId: string,
    content: string,
    wordCount?: number
): Promise<VersionEntry> {
    const wc = wordCount ?? countWords(content);
    const now = Date.now();
    const hash = hashString(content);
    const id = `${fileId}-${now}-${hash}`;

    const entry: VersionEntry = {
        id,
        fileId,
        content,
        createdAt: now,
        wordCount: wc,
        hash,
    };

    await browserStorage.storeVersion(entry);
    lastVersionByFile.set(fileId, { content, wordCount: wc, createdAt: now });

    await pruneVersions(fileId, now);

    return entry;
}

/**
 * Get versions for a file (newest first).
 */
export async function getVersions(fileId: string): Promise<VersionEntry[]> {
    return browserStorage.getVersionsForFile(fileId);
}

/**
 * Restore content from a version. Returns the version's content.
 */
export async function restoreVersion(versionId: string): Promise<string | null> {
    const entry = await browserStorage.getVersionById(versionId);
    return entry?.content ?? null;
}

/**
 * Initialize lastVersionByFile when loading a file (e.g. when switching files).
 * Call with current content so we don't create an immediate version on first edit.
 */
export function initLastVersionForFile(fileId: string, content: string): void {
    lastVersionByFile.set(fileId, {
        content,
        wordCount: countWords(content),
        createdAt: Date.now(),
    });
}

/**
 * Start the 5-minute periodic check. Returns cleanup function.
 * Pass getters that return current fileId and content (use refs to avoid stale closures).
 */
export function startPeriodicVersionCheck(
    getActiveFileId: () => string | null,
    getActiveFileContent: () => string
): () => void {
    const intervalId = setInterval(async () => {
        const fileId = getActiveFileId();
        if (!fileId) return;
        const content = getActiveFileContent();
        if (!content) return;
        await maybeCreateVersion(fileId, content);
    }, PERIODIC_INTERVAL_MS);

    return () => clearInterval(intervalId);
}

async function pruneVersions(fileId: string, now: number): Promise<void> {
    const versions = await browserStorage.getVersionsForFile(fileId, 999);
    if (versions.length <= MAX_VERSIONS_PER_FILE) return;

    const sorted = [...versions].sort((a, b) => b.createdAt - a.createdAt);
    const keep = new Set<string>();

    if (sorted[0]) {
        keep.add(sorted[0].id);
    }

    for (const threshold of RETENTION_INTERVALS_MS) {
        const match = sorted.find((v) => (now - v.createdAt) >= threshold);
        if (match) {
            keep.add(match.id);
        }
    }

    const keepIds = Array.from(keep);
    const toDelete = sorted.filter((v) => !keep.has(v.id)).map((v) => v.id);

    if (keepIds.length > MAX_VERSIONS_PER_FILE) {
        const trimmedKeep = keepIds.slice(0, MAX_VERSIONS_PER_FILE);
        const trimmedKeepSet = new Set(trimmedKeep);
        const extraDeletes = sorted.filter((v) => !trimmedKeepSet.has(v.id)).map((v) => v.id);
        await browserStorage.deleteVersionsByIds(extraDeletes);
        return;
    }

    await browserStorage.deleteVersionsByIds(toDelete);
}
