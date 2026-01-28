/**
 * Firestore Database Operations
 * 
 * Provides CRUD operations for syncing data to Firestore.
 * Structure: /artifacts/{appId}/users/{userId}/{collection}/{docId}
 * 
 * Note: Only text-based files are synced (markdown, templates).
 * Images and fonts are NOT synced (they contain binary data and would
 * require Firebase Storage which is not available on the free tier).
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
import { FileEntry } from '../types';

// Collection names
const COLLECTION_FILES = 'files';

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
