/**
 * Accessors for a user's cloud-saved markdown, templates, and fonts (read;
 * markdown upload and folder creation use the same Firestore layout as the web app).
 *
 * Mirrors the schema used by the web app's Firestore sync layer
 * (`lib/firebase/firestore.ts`). All paths live under:
 *
 *   artifacts/{appId}/users/{userId}/files/{syncId}
 *   artifacts/{appId}/users/{userId}/fonts/{syncId}
 *
 * Files use `path` as a logical name (e.g. `Templates/Default/Basic.mdt`).
 * Fonts use `id` (slugified family) and store base64 in `dataBase64`.
 */

import { randomUUID } from 'node:crypto';
import { Timestamp, type DocumentData } from 'firebase-admin/firestore';
import {
    FIREBASE_APP_ID,
    getFirebaseAdminFirestore,
    isFirebaseAdminConfigured,
} from './firebase-admin';

export interface CloudFile {
    syncId: string;
    path: string;
    content: string;
    type: 'file' | 'folder';
    updatedAt: number;
    isDeleted: boolean;
}

export interface CloudFont {
    syncId: string;
    id: string;
    family: string;
    fileName: string;
    format: string;
    createdAt: number;
    updatedAt: number;
    isDeleted: boolean;
    /** Decoded font bytes (only populated by `getFont*` helpers). */
    data?: Uint8Array;
}

function userCollection(userId: string, name: 'files' | 'fonts') {
    const db = getFirebaseAdminFirestore();
    if (!db) throw new Error('Firebase Admin SDK is not configured on the API service');
    return db
        .collection('artifacts')
        .doc(FIREBASE_APP_ID)
        .collection('users')
        .doc(userId)
        .collection(name);
}

function toCloudFile(data: DocumentData): CloudFile {
    const updatedAt = typeof data.updatedAt === 'object' && data.updatedAt?.toMillis
        ? data.updatedAt.toMillis()
        : (typeof data.updatedAt === 'number' ? data.updatedAt : Date.now());
    return {
        syncId: String(data.syncId ?? ''),
        path: String(data.path ?? ''),
        content: String(data.content ?? ''),
        type: data.type === 'folder' ? 'folder' : 'file',
        updatedAt,
        isDeleted: !!data.isDeleted,
    };
}

function decodeBase64(b64: string): Uint8Array {
    return new Uint8Array(Buffer.from(b64, 'base64'));
}

function toCloudFont(data: DocumentData, includeData: boolean): CloudFont {
    const updatedAt = typeof data.updatedAt === 'object' && data.updatedAt?.toMillis
        ? data.updatedAt.toMillis()
        : (typeof data.updatedAt === 'number' ? data.updatedAt : Date.now());
    const font: CloudFont = {
        syncId: String(data.syncId ?? ''),
        id: String(data.id ?? ''),
        family: String(data.family ?? ''),
        fileName: String(data.fileName ?? ''),
        format: String(data.format ?? 'truetype'),
        createdAt: typeof data.createdAt === 'number' ? data.createdAt : updatedAt,
        updatedAt,
        isDeleted: !!data.isDeleted,
    };
    if (includeData) {
        const b64 = typeof data.dataBase64 === 'string' ? data.dataBase64 : '';
        if (b64) font.data = decodeBase64(b64);
    }
    return font;
}

/** Keep only the most-recently-updated document per logical `path`. */
function deduplicateByPath(files: CloudFile[]): CloudFile[] {
    const latest = new Map<string, CloudFile>();
    for (const f of files) {
        const existing = latest.get(f.path);
        if (!existing || f.updatedAt > existing.updatedAt) {
            latest.set(f.path, f);
        }
    }
    return Array.from(latest.values());
}

export async function listUserFiles(userId: string): Promise<CloudFile[]> {
    if (!isFirebaseAdminConfigured()) return [];
    const snap = await userCollection(userId, 'files').get();
    const all = snap.docs.map((d) => toCloudFile(d.data()));
    return deduplicateByPath(all).filter((f) => !f.isDeleted && f.type === 'file');
}

export async function listUserTemplates(userId: string): Promise<CloudFile[]> {
    const files = await listUserFiles(userId);
    return files.filter((f) => f.path.startsWith('Templates/') && /\.(mdt|json)$/i.test(f.path));
}

export async function listUserMarkdownFiles(userId: string): Promise<CloudFile[]> {
    const files = await listUserFiles(userId);
    return files.filter((f) => !f.path.startsWith('Templates/'));
}

/**
 * Distinct parent folder paths for the user's vault (excludes `Templates/`), from explicit
 * `type: 'folder'` entries and parent segments of saved markdown file paths.
 */
export async function listUserMarkdownFolderPaths(userId: string): Promise<string[]> {
    if (!isFirebaseAdminConfigured()) return [];
    const snap = await userCollection(userId, 'files').get();
    const all = snap.docs.map((d) => toCloudFile(d.data()));
    const entries = deduplicateByPath(all).filter((f) => !f.isDeleted && !f.path.startsWith('Templates/'));
    const set = new Set<string>();
    for (const f of entries) {
        if (f.type === 'folder') {
            set.add(f.path);
        }
        const parts = f.path.split('/').filter(Boolean);
        for (let i = 0; i < parts.length - 1; i++) {
            set.add(parts.slice(0, i + 1).join('/'));
        }
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b));
}

export async function getUserFileByPath(userId: string, filePath: string): Promise<CloudFile | null> {
    if (!isFirebaseAdminConfigured()) return null;
    const trimmed = filePath.replace(/^\/+/, '');
    const snap = await userCollection(userId, 'files').where('path', '==', trimmed).get();
    if (snap.empty) return null;
    const files = snap.docs.map((d) => toCloudFile(d.data()));
    // Multiple docs can exist for the same path; take the latest non-deleted one.
    const latest = files
        .filter((f) => !f.isDeleted)
        .sort((a, b) => b.updatedAt - a.updatedAt)[0];
    return latest ?? null;
}

function stripSlashes(s: string): string {
    return s.replace(/^\/+/g, '').replace(/\/+$/g, '').trim();
}

/** Normalize and validate a logical cloud `path` (same rules as upload targets). */
export function normalizeCloudFilepath(input: string): string {
    const trimmed = stripSlashes(input.replace(/^\/+/, ''));
    if (!trimmed) throw new Error('Path is empty');
    assertSafeCloudRelativePath(trimmed);
    return trimmed;
}

/** Rejects traversal, backslashes, and control characters in a single path segment or full relative path. */
function assertSafeCloudRelativePath(p: string): void {
    if (!p) throw new Error('Path is empty');
    if (p.includes('..') || p.includes('\\') || /[\x00-\x1f\x7f]/.test(p)) {
        throw new Error('Invalid path');
    }
}

function isMarkdownFilename(name: string): boolean {
    return /\.(md|markdown|mdx)$/i.test(name);
}

/**
 * Ensures each segment of `folderPath` exists as a `type: 'folder'` document.
 * `folderPath` uses forward slashes, no leading slash (e.g. `Notes/2025`).
 */
export async function ensureFolderPathExists(userId: string, folderPath: string): Promise<void> {
    if (!isFirebaseAdminConfigured()) throw new Error('Firebase Admin SDK is not configured on the API service');
    const base = stripSlashes(folderPath);
    if (!base) return;
    assertSafeCloudRelativePath(base);
    const parts = base.split('/').filter((p) => p.length > 0);
    let acc = '';
    for (const part of parts) {
        if (part === '.' || part === '..') throw new Error('Invalid folder path');
        acc = acc ? `${acc}/${part}` : part;
        const existing = await getUserFileByPath(userId, acc);
        if (existing) {
            if (existing.type === 'file') {
                throw new Error(`A file already exists at "${acc}"; cannot create folder here`);
            }
            continue;
        }
        const syncId = randomUUID();
        const col = userCollection(userId, 'files');
        const now = Timestamp.fromMillis(Date.now());
        await col.doc(syncId).set({
            syncId,
            path: acc,
            content: '',
            type: 'folder',
            updatedAt: now,
            isDeleted: false,
        });
    }
}

export interface UpsertMarkdownResult {
    syncId: string;
    path: string;
    created: boolean;
}

/**
 * Writes markdown to the user's `files` collection. Document id is always `syncId`
 * (same convention as the web app). Creates parent folders when missing.
 */
export async function upsertUserMarkdownFile(
    userId: string,
    input: { folderPath: string; filename: string; content: string },
): Promise<UpsertMarkdownResult> {
    if (!isFirebaseAdminConfigured()) throw new Error('Firebase Admin SDK is not configured on the API service');
    const folder = stripSlashes(input.folderPath);
    const rawName = stripSlashes(input.filename);
    if (!rawName || rawName.includes('/')) {
        throw new Error('Filename must be a single name without slashes');
    }
    assertSafeCloudRelativePath(rawName);
    if (folder) assertSafeCloudRelativePath(folder);
    if (!isMarkdownFilename(rawName)) {
        throw new Error('Filename must end with .md, .markdown, or .mdx');
    }
    const fullPath = folder ? `${folder}/${rawName}` : rawName;
    assertSafeCloudRelativePath(fullPath);

    await ensureFolderPathExists(userId, folder);

    const existing = await getUserFileByPath(userId, fullPath);
    if (existing && existing.type === 'folder') {
        throw new Error(`Path "${fullPath}" is a folder`);
    }
    const syncId = existing?.syncId && existing.type === 'file' ? existing.syncId : randomUUID();
    const created = !existing || existing.type !== 'file';
    const col = userCollection(userId, 'files');
    const now = Timestamp.fromMillis(Date.now());
    await col.doc(syncId).set({
        syncId,
        path: fullPath,
        content: input.content,
        type: 'file',
        updatedAt: now,
        isDeleted: false,
    });
    return { syncId, path: fullPath, created };
}

export async function listUserFonts(userId: string, includeData = false): Promise<CloudFont[]> {
    if (!isFirebaseAdminConfigured()) return [];
    const snap = await userCollection(userId, 'fonts').get();
    return snap.docs
        .map((d) => toCloudFont(d.data(), includeData))
        .filter((f) => !f.isDeleted);
}

export async function getUserFontByIdentifier(
    userId: string,
    identifier: string,
): Promise<CloudFont | null> {
    if (!isFirebaseAdminConfigured()) return null;
    const trimmed = identifier.trim();
    if (!trimmed) return null;

    // Try `id` first (case-insensitive slug match)
    const byId = await userCollection(userId, 'fonts').where('id', '==', trimmed).limit(1).get();
    if (!byId.empty) {
        const f = toCloudFont(byId.docs[0]!.data(), true);
        return f.isDeleted ? null : f;
    }

    // Fall back to `family` match (exact)
    const byFamily = await userCollection(userId, 'fonts').where('family', '==', trimmed).limit(1).get();
    if (!byFamily.empty) {
        const f = toCloudFont(byFamily.docs[0]!.data(), true);
        return f.isDeleted ? null : f;
    }

    // Last resort: case-insensitive scan
    const all = await listUserFonts(userId, true);
    const target = trimmed.toLowerCase();
    return all.find((f) => f.id.toLowerCase() === target || f.family.toLowerCase() === target) ?? null;
}

// ==================== API key verification ====================

export interface VerifiedApiKey {
    token: string;
    userId: string;
    name: string;
    createdAt: number;
}

/**
 * Look up a user-generated API key in Firestore. Returns `null` for unknown
 * tokens or when the admin SDK is not configured.
 */
export async function verifyApiKey(token: string): Promise<VerifiedApiKey | null> {
    if (!isFirebaseAdminConfigured()) return null;
    const db = getFirebaseAdminFirestore();
    if (!db) return null;
    const docRef = db
        .collection('artifacts')
        .doc(FIREBASE_APP_ID)
        .collection('api_keys')
        .doc(token);
    const snapshot = await docRef.get();
    if (!snapshot.exists) return null;
    const data = snapshot.data() || {};
    if (typeof data.userId !== 'string' || !data.userId) return null;
    // Best-effort update; ignore errors
    docRef.set({ lastUsedAt: Date.now() }, { merge: true }).catch(() => undefined);
    return {
        token,
        userId: data.userId,
        name: typeof data.name === 'string' ? data.name : 'API key',
        createdAt: typeof data.createdAt === 'number' ? data.createdAt : Date.now(),
    };
}
