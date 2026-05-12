/**
 * API key management.
 *
 * API keys are random 32-byte hex strings prefixed `mme_`. The token string
 * itself is used as the document ID under:
 *
 *   artifacts/{appId}/api_keys/{token}
 *
 * Documents store `{ userId, name, createdAt, lastUsedAt? }`. Security rules
 * restrict reads/deletes to the owner. The API service uses the Firebase
 * Admin SDK to look up `userId` from a presented token.
 */

import {
    collection,
    deleteDoc,
    doc,
    getDocs,
    query,
    setDoc,
    where,
    type DocumentData,
} from 'firebase/firestore';
import { FIREBASE_APP_ID, getFirebaseFirestore, isFirebaseConfigured } from './config';

const COLLECTION_API_KEYS = 'api_keys';
const API_KEY_PREFIX = 'mme_';
const API_KEY_RANDOM_BYTES = 24;

export interface ApiKey {
    token: string;
    userId: string;
    name: string;
    createdAt: number;
    lastUsedAt?: number;
}

function getKeysCollection() {
    const db = getFirebaseFirestore();
    return collection(db, 'artifacts', FIREBASE_APP_ID, COLLECTION_API_KEYS);
}

function getKeyDoc(token: string) {
    const db = getFirebaseFirestore();
    return doc(db, 'artifacts', FIREBASE_APP_ID, COLLECTION_API_KEYS, token);
}

function randomHex(byteLength: number): string {
    const bytes = new Uint8Array(byteLength);
    if (typeof globalThis.crypto?.getRandomValues === 'function') {
        globalThis.crypto.getRandomValues(bytes);
    } else {
        for (let i = 0; i < byteLength; i++) {
            bytes[i] = Math.floor(Math.random() * 256);
        }
    }
    let out = '';
    for (let i = 0; i < bytes.length; i++) {
        out += bytes[i].toString(16).padStart(2, '0');
    }
    return out;
}

/** Format: `mme_<48 hex chars>`. */
export function generateApiKeyToken(): string {
    return `${API_KEY_PREFIX}${randomHex(API_KEY_RANDOM_BYTES)}`;
}

function fromDocData(token: string, data: DocumentData): ApiKey {
    return {
        token,
        userId: data.userId,
        name: data.name || 'API key',
        createdAt: typeof data.createdAt === 'number' ? data.createdAt : Date.now(),
        lastUsedAt: typeof data.lastUsedAt === 'number' ? data.lastUsedAt : undefined,
    };
}

/**
 * Create a new API key for the given user. The plaintext token is the doc ID
 * and only ever returned here. Callers should show it once to the user.
 */
export async function createApiKey(userId: string, name: string): Promise<ApiKey> {
    if (!isFirebaseConfigured()) throw new Error('Firebase is not configured');
    const token = generateApiKeyToken();
    const createdAt = Date.now();
    await setDoc(getKeyDoc(token), {
        userId,
        name: name?.trim() || 'API key',
        createdAt,
    });
    return { token, userId, name: name?.trim() || 'API key', createdAt };
}

export async function listApiKeys(userId: string): Promise<ApiKey[]> {
    if (!isFirebaseConfigured()) return [];
    const q = query(getKeysCollection(), where('userId', '==', userId));
    const snapshot = await getDocs(q);
    return snapshot.docs
        .map(d => fromDocData(d.id, d.data()))
        .sort((a, b) => b.createdAt - a.createdAt);
}

export async function deleteApiKey(token: string): Promise<void> {
    if (!isFirebaseConfigured()) return;
    await deleteDoc(getKeyDoc(token));
}
