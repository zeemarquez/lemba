/**
 * Firestore Database Operations
 * 
 * Provides CRUD operations for syncing data to Firestore.
 * Structure: /artifacts/{appId}/users/{userId}/{collection}/{docId}
 * 
 * Text files (markdown, templates) sync as UTF-8 content.
 * Custom fonts sync as base64 in the `fonts` collection (Firestore document size limit applies).
 * Images remain local-only.
 */

import {
    collection,
    doc,
    getDoc,
    getDocs,
    setDoc,
    deleteDoc,
    query,
    where,
    orderBy,
    writeBatch,
    Timestamp,
    DocumentData,
    onSnapshot,
    Unsubscribe,
} from 'firebase/firestore';
import { getFirebaseFirestore, isFirebaseConfigured, FIREBASE_APP_ID } from './config';
import { FileEntry, FontEntry } from '../types';
import { base64ToBlob, blobToBase64, mimeTypeForFontFormat } from './font-binary-codec';

// Collection names
const COLLECTION_FILES = 'files';
const COLLECTION_FONTS = 'fonts';

/** Max raw font size to sync (~750KB); base64 must stay under Firestore's ~1 MiB document limit. */
export const MAX_FONT_BYTES_FOR_FIRESTORE = 750 * 1024;

/**
 * Get the base path for a user's data
 */
function getUserBasePath(userId: string): string {
    return `artifacts/${FIREBASE_APP_ID}/users/${userId}`;
}

/**
 * Get a collection reference for a user
 */
function getUserCollection(userId: string, collectionName: string) {
    const db = getFirebaseFirestore();
    return collection(db, getUserBasePath(userId), collectionName);
}

/**
 * Get a document reference
 */
function getUserDoc(userId: string, collectionName: string, docId: string) {
    const db = getFirebaseFirestore();
    return doc(db, getUserBasePath(userId), collectionName, docId);
}

// ==================== File Operations ====================

/**
 * Firestore representation of a file (without blob data)
 */
export interface FirestoreFileEntry {
    syncId: string;
    path: string;
    content: string;
    type: 'file' | 'folder';
    updatedAt: Timestamp;
    isDeleted: boolean;
}

/**
 * Convert FileEntry to Firestore format
 */
function fileEntryToFirestore(entry: FileEntry): FirestoreFileEntry {
    return {
        syncId: entry.syncId,
        path: entry.path,
        content: entry.content,
        type: entry.type,
        updatedAt: Timestamp.fromMillis(entry.updatedAt),
        isDeleted: entry.isDeleted,
    };
}

/**
 * Convert Firestore document to FileEntry
 */
function firestoreToFileEntry(data: DocumentData, userId: string): FileEntry {
    return {
        syncId: data.syncId,
        path: data.path,
        content: data.content,
        type: data.type,
        updatedAt: data.updatedAt?.toMillis() || Date.now(),
        isDeleted: data.isDeleted || false,
        userId: userId,
    };
}

/**
 * Save a file to Firestore
 */
export async function saveFile(userId: string, entry: FileEntry): Promise<void> {
    if (!isFirebaseConfigured()) return;

    const docRef = getUserDoc(userId, COLLECTION_FILES, entry.syncId);
    await setDoc(docRef, fileEntryToFirestore(entry));
}

/**
 * Get a file from Firestore
 */
export async function getFile(userId: string, syncId: string): Promise<FileEntry | null> {
    if (!isFirebaseConfigured()) return null;

    const docRef = getUserDoc(userId, COLLECTION_FILES, syncId);
    const snapshot = await getDoc(docRef);
    
    if (!snapshot.exists()) return null;
    return firestoreToFileEntry(snapshot.data(), userId);
}

/**
 * Get all files for a user
 */
export async function getAllFiles(userId: string): Promise<FileEntry[]> {
    if (!isFirebaseConfigured()) return [];

    const colRef = getUserCollection(userId, COLLECTION_FILES);
    const snapshot = await getDocs(colRef);
    
    return snapshot.docs.map(doc => firestoreToFileEntry(doc.data(), userId));
}

/**
 * Get files updated since a timestamp
 */
export async function getFilesUpdatedSince(
    userId: string,
    timestamp: number
): Promise<FileEntry[]> {
    if (!isFirebaseConfigured()) return [];

    const colRef = getUserCollection(userId, COLLECTION_FILES);
    const q = query(
        colRef,
        where('updatedAt', '>', Timestamp.fromMillis(timestamp)),
        orderBy('updatedAt', 'asc')
    );
    
    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => firestoreToFileEntry(doc.data(), userId));
}

/**
 * Delete a file from Firestore (hard delete)
 */
export async function deleteFile(userId: string, syncId: string): Promise<void> {
    if (!isFirebaseConfigured()) return;

    const docRef = getUserDoc(userId, COLLECTION_FILES, syncId);
    await deleteDoc(docRef);
}

/**
 * Batch save multiple files
 */
export async function batchSaveFiles(userId: string, entries: FileEntry[]): Promise<void> {
    if (!isFirebaseConfigured() || entries.length === 0) return;

    const db = getFirebaseFirestore();
    const batch = writeBatch(db);

    for (const entry of entries) {
        const docRef = getUserDoc(userId, COLLECTION_FILES, entry.syncId);
        batch.set(docRef, fileEntryToFirestore(entry));
    }

    await batch.commit();
}

// ==================== Real-time Listeners (Future Use) ====================

/**
 * Subscribe to file changes (for future real-time sync)
 * Currently not used - using periodic polling instead
 */
export function subscribeToFileChanges(
    userId: string,
    callback: (files: FileEntry[]) => void
): Unsubscribe {
    if (!isFirebaseConfigured()) {
        return () => {};
    }

    const colRef = getUserCollection(userId, COLLECTION_FILES);
    return onSnapshot(colRef, (snapshot) => {
        const files = snapshot.docs.map(doc => firestoreToFileEntry(doc.data(), userId));
        callback(files);
    });
}

// ==================== Font Operations ====================

export interface FirestoreFontEntry {
    syncId: string;
    id: string;
    family: string;
    fileName: string;
    format: string;
    createdAt: number;
    updatedAt: Timestamp;
    isDeleted: boolean;
    dataBase64: string;
}

async function fontEntryToFirestore(entry: FontEntry): Promise<FirestoreFontEntry> {
    let dataBase64 = '';
    if (!entry.isDeleted && entry.blob && entry.blob.size > 0) {
        dataBase64 = await blobToBase64(entry.blob);
    }

    return {
        syncId: entry.syncId,
        id: entry.id,
        family: entry.family,
        fileName: entry.fileName,
        format: entry.format,
        createdAt: entry.createdAt,
        updatedAt: Timestamp.fromMillis(entry.updatedAt),
        isDeleted: entry.isDeleted,
        dataBase64,
    };
}

function firestoreToFontEntry(data: DocumentData, userId: string): FontEntry {
    const mime = mimeTypeForFontFormat((data.format as string) || 'truetype');
    const dataBase64 = (data.dataBase64 as string) || '';
    const blob =
        data.isDeleted || !dataBase64
            ? new Blob()
            : base64ToBlob(dataBase64, mime);

    return {
        syncId: data.syncId,
        id: data.id,
        family: data.family,
        fileName: data.fileName,
        format: data.format,
        createdAt: data.createdAt ?? data.updatedAt?.toMillis?.() ?? Date.now(),
        blob,
        updatedAt: data.updatedAt?.toMillis() || Date.now(),
        isDeleted: data.isDeleted || false,
        userId,
    };
}

/**
 * @returns false if the font was skipped (too large for Firestore); true if written or nothing to do.
 */
export async function saveFontEntry(userId: string, entry: FontEntry): Promise<boolean> {
    if (!isFirebaseConfigured()) return false;

    if (!entry.isDeleted && entry.blob && entry.blob.size > MAX_FONT_BYTES_FOR_FIRESTORE) {
        console.warn(
            `[Firestore] Font "${entry.family}" (${entry.blob.size} bytes) exceeds sync limit (${MAX_FONT_BYTES_FOR_FIRESTORE} bytes); not uploading.`
        );
        return false;
    }

    const docRef = getUserDoc(userId, COLLECTION_FONTS, entry.syncId);
    const payload = await fontEntryToFirestore(entry);
    await setDoc(docRef, payload);
    return true;
}

export async function getFontEntry(userId: string, syncId: string): Promise<FontEntry | null> {
    if (!isFirebaseConfigured()) return null;

    const docRef = getUserDoc(userId, COLLECTION_FONTS, syncId);
    const snapshot = await getDoc(docRef);

    if (!snapshot.exists()) return null;
    return firestoreToFontEntry(snapshot.data(), userId);
}

export async function getAllFontEntries(userId: string): Promise<FontEntry[]> {
    if (!isFirebaseConfigured()) return [];

    const colRef = getUserCollection(userId, COLLECTION_FONTS);
    const snapshot = await getDocs(colRef);

    return snapshot.docs.map(doc => firestoreToFontEntry(doc.data(), userId));
}

export async function getFontEntriesUpdatedSince(
    userId: string,
    timestamp: number
): Promise<FontEntry[]> {
    if (!isFirebaseConfigured()) return [];

    const colRef = getUserCollection(userId, COLLECTION_FONTS);
    const q = query(
        colRef,
        where('updatedAt', '>', Timestamp.fromMillis(timestamp)),
        orderBy('updatedAt', 'asc')
    );

    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => firestoreToFontEntry(doc.data(), userId));
}

export async function deleteFontEntry(userId: string, syncId: string): Promise<void> {
    if (!isFirebaseConfigured()) return;

    const docRef = getUserDoc(userId, COLLECTION_FONTS, syncId);
    await deleteDoc(docRef);
}
