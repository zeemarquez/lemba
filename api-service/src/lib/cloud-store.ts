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
 * Files use `path` as a logical name (e.g. `Files/Notes/report.md`, `Templates/Default/Basic.mdt`).
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

/**
 * Resolve a markdown file path for reads. Tries the exact path, then `Files/{path}` when the
 * caller omitted the vault prefix (legacy API uploads).
 */
export async function getUserMarkdownFileByPath(userId: string, filePath: string): Promise<CloudFile | null> {
    const trimmed = filePath.replace(/^\/+/, '').trim();
    if (!trimmed) return null;
    let file = await getUserFileByPath(userId, trimmed);
    if (file) return file;
    if (!trimmed.startsWith('Files/') && !trimmed.startsWith('Templates/')) {
        file = await getUserFileByPath(userId, `Files/${trimmed}`);
    }
    return file ?? null;
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
 * The web app explorer only lists markdown under logical path `Files/…` (see `Sidebar.tsx`).
 * API uploads must use the same prefix unless the caller already used `Files/` or `Templates/`.
 */
export function normalizeMarkdownVaultUploadPath(folderPath: string, filename: string): string {
    const folder = stripSlashes(folderPath);
    const name = stripSlashes(filename);
    if (!name) throw new Error('Filename is empty');
    const joined = folder ? `${folder}/${name}` : name;
    if (joined.startsWith('Files/') || joined.startsWith('Templates/')) {
        return joined;
    }
    return `Files/${joined}`;
}

/**
 * Ensures each segment of `folderPath` exists as a `type: 'folder'` document.
 * `folderPath` uses forward slashes, no leading slash (e.g. `Files/Notes/2025`).
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

export interface WriteMarkdownResult {
    syncId: string;
    path: string;
}

/**
 * Creates a new markdown file under the vault `Files/…` layout. Parent folders are created when missing.
 * Throws if a non-deleted file already exists at the target path (use `replaceUserMarkdownFileByPath` to overwrite).
 */
export async function createUserMarkdownFile(
    userId: string,
    input: { folderPath: string; filename: string; content: string },
): Promise<WriteMarkdownResult> {
    if (!isFirebaseAdminConfigured()) throw new Error('Firebase Admin SDK is not configured on the API service');
    const rawName = stripSlashes(input.filename);
    if (!rawName || rawName.includes('/')) {
        throw new Error('Filename must be a single name without slashes');
    }
    assertSafeCloudRelativePath(rawName);
    if (!isMarkdownFilename(rawName)) {
        throw new Error('Filename must end with .md, .markdown, or .mdx');
    }
    const folderRaw = stripSlashes(input.folderPath);
    if (folderRaw) assertSafeCloudRelativePath(folderRaw);

    const fullPath = normalizeMarkdownVaultUploadPath(input.folderPath, rawName);
    assertSafeCloudRelativePath(fullPath);

    const parentEnd = fullPath.lastIndexOf('/');
    const folderChain = parentEnd > 0 ? fullPath.slice(0, parentEnd) : '';

    await ensureFolderPathExists(userId, folderChain);

    const existing = await getUserFileByPath(userId, fullPath);
    if (existing && existing.type === 'folder') {
        throw new Error(`Path "${fullPath}" is a folder`);
    }
    if (existing && existing.type === 'file' && !existing.isDeleted) {
        throw new Error(
            `File already exists at "${fullPath}". Use POST /v1/me/files/replace (or the replace_cloud_markdown_document MCP tool) to overwrite.`,
        );
    }

    const syncId = randomUUID();
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
    return { syncId, path: fullPath };
}

/**
 * Overwrites markdown content for an existing file at `filepath` (logical cloud path).
 * Resolves the same path rules as reads (`Files/` prefix when omitted).
 */
export async function replaceUserMarkdownFileByPath(
    userId: string,
    filepath: string,
    content: string,
): Promise<WriteMarkdownResult> {
    if (!isFirebaseAdminConfigured()) throw new Error('Firebase Admin SDK is not configured on the API service');
    const normalized = normalizeCloudFilepath(filepath);
    const file = await getUserMarkdownFileByPath(userId, normalized);
    if (!file) {
        throw new Error(`No file at path "${normalized}"`);
    }
    if (file.type === 'folder') {
        throw new Error(`Path "${file.path}" is a folder, not a file`);
    }
    const col = userCollection(userId, 'files');
    const now = Timestamp.fromMillis(Date.now());
    await col.doc(file.syncId).set({
        syncId: file.syncId,
        path: file.path,
        content,
        type: 'file',
        updatedAt: now,
        isDeleted: false,
    });
    return { syncId: file.syncId, path: file.path };
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

/** Persist an OAuth-issued or programmatically-created API key to Firestore. */
export async function storeApiKey(token: string, userId: string, name: string): Promise<void> {
    const db = getFirebaseAdminFirestore();
    if (!db) throw new Error('Firebase Admin SDK is not configured on the API service');
    await db
        .collection('artifacts')
        .doc(FIREBASE_APP_ID)
        .collection('api_keys')
        .doc(token)
        .set({ userId, name, createdAt: Date.now() });
}
