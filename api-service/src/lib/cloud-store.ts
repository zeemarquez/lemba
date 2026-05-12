/**
 * Read-only accessors for a user's cloud-saved markdown, templates, and fonts.
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

function toCloudFile(data: FirebaseFirestore.DocumentData): CloudFile {
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

function toCloudFont(data: FirebaseFirestore.DocumentData, includeData: boolean): CloudFont {
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

export async function listUserFiles(userId: string): Promise<CloudFile[]> {
    if (!isFirebaseAdminConfigured()) return [];
    const snap = await userCollection(userId, 'files').get();
    return snap.docs
        .map((d) => toCloudFile(d.data()))
        .filter((f) => !f.isDeleted && f.type === 'file');
}

export async function listUserTemplates(userId: string): Promise<CloudFile[]> {
    const files = await listUserFiles(userId);
    return files.filter((f) => f.path.startsWith('Templates/') && /\.(mdt|json)$/i.test(f.path));
}

export async function listUserMarkdownFiles(userId: string): Promise<CloudFile[]> {
    const files = await listUserFiles(userId);
    return files.filter((f) => !f.path.startsWith('Templates/'));
}

export async function getUserFileByPath(userId: string, filePath: string): Promise<CloudFile | null> {
    if (!isFirebaseAdminConfigured()) return null;
    const trimmed = filePath.replace(/^\/+/, '');
    const snap = await userCollection(userId, 'files').where('path', '==', trimmed).limit(1).get();
    if (snap.empty) return null;
    const file = toCloudFile(snap.docs[0]!.data());
    if (file.isDeleted) return null;
    return file;
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
