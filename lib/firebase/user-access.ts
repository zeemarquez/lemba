/**
 * User Access Management
 * 
 * Manages user access levels and permissions.
 * Collection: users_access/{userId}
 * 
 * Access Levels:
 * - "basic": Default tier, no sync access
 * - "premium": Full access including cloud sync
 * 
 * Note: User access levels are set manually in Firebase Console.
 */

import { doc, getDoc, setDoc } from 'firebase/firestore';
import { getFirebaseFirestore, isFirebaseConfigured, FIREBASE_APP_ID } from './config';

// User access levels
export type UserAccessLevel = 'basic' | 'premium';

// User access document structure
export interface UserAccess {
    accessLevel: UserAccessLevel;
    createdAt: number;
    updatedAt: number;
}

// Default access level for new users
const DEFAULT_ACCESS_LEVEL: UserAccessLevel = 'basic';

// Collection name
const COLLECTION_USERS_ACCESS = 'users_access';

/**
 * Get the document reference for a user's access
 */
function getUserAccessDoc(userId: string) {
    const db = getFirebaseFirestore();
    return doc(db, 'artifacts', FIREBASE_APP_ID, COLLECTION_USERS_ACCESS, userId);
}

/**
 * Get user access level from Firestore
 * 
 * Returns 'basic' (default) if:
 * - User is not in users_access collection
 * - Document exists but accessLevel field is missing
 * - Error occurs while fetching
 * - Firebase is not configured
 * 
 * Note: This collection is read-only from the client. Records must be created
 * via Firebase Admin SDK or manually in Firebase Console.
 */
export async function getUserAccessLevel(userId: string): Promise<UserAccessLevel> {
    if (!isFirebaseConfigured()) {
        return DEFAULT_ACCESS_LEVEL;
    }

    try {
        const docRef = getUserAccessDoc(userId);
        const snapshot = await getDoc(docRef);

        // User not in collection - fallback to basic
        if (!snapshot.exists()) {
            console.log(`[UserAccess] User ${userId} not found in users_access collection, defaulting to ${DEFAULT_ACCESS_LEVEL}`);
            return DEFAULT_ACCESS_LEVEL;
        }

        const data = snapshot.data() as UserAccess;
        const accessLevel = data?.accessLevel;

        // Document exists but accessLevel field is missing or invalid - fallback to basic
        if (!accessLevel || (accessLevel !== 'basic' && accessLevel !== 'premium')) {
            console.warn(`[UserAccess] Invalid or missing accessLevel for user ${userId}, defaulting to ${DEFAULT_ACCESS_LEVEL}`);
            return DEFAULT_ACCESS_LEVEL;
        }

        return accessLevel;
    } catch (error) {
        // Error fetching - fallback to basic
        console.error('[UserAccess] Error fetching user access level:', error);
        return DEFAULT_ACCESS_LEVEL;
    }
}

/**
 * Get full user access record
 */
export async function getUserAccess(userId: string): Promise<UserAccess | null> {
    if (!isFirebaseConfigured()) {
        return null;
    }

    try {
        const docRef = getUserAccessDoc(userId);
        const snapshot = await getDoc(docRef);

        if (!snapshot.exists()) {
            return null;
        }

        return snapshot.data() as UserAccess;
    } catch (error) {
        console.error('[UserAccess] Error fetching user access:', error);
        return null;
    }
}

/**
 * Create a new user access record with default access level
 * 
 * NOTE: This function will NOT work from the client side due to read-only
 * security rules. Use Firebase Admin SDK or create records manually in
 * Firebase Console.
 * 
 * This function is kept for reference/documentation purposes only.
 * 
 * @deprecated Use Admin SDK or Firebase Console to create user access records
 */
export async function createUserAccessRecord(
    userId: string,
    accessLevel: UserAccessLevel = DEFAULT_ACCESS_LEVEL
): Promise<void> {
    if (!isFirebaseConfigured()) {
        return;
    }

    try {
        const docRef = getUserAccessDoc(userId);
        const now = Date.now();

        await setDoc(docRef, {
            accessLevel,
            createdAt: now,
            updatedAt: now,
        });

        console.log(`[UserAccess] Created access record for user ${userId} with level: ${accessLevel}`);
    } catch (error: any) {
        // Expected to fail due to read-only security rules
        console.warn('[UserAccess] Cannot create access record from client (read-only rules). Use Admin SDK or Firebase Console.');
        throw new Error('User access records can only be created via Admin SDK or Firebase Console');
    }
}

/**
 * Check if user has sync access (premium users only)
 */
export async function hasSyncAccess(userId: string): Promise<boolean> {
    const accessLevel = await getUserAccessLevel(userId);
    return accessLevel === 'premium';
}

/**
 * Check if a user has a specific access level or higher
 */
export function hasAccessLevel(
    userLevel: UserAccessLevel,
    requiredLevel: UserAccessLevel
): boolean {
    const levels: UserAccessLevel[] = ['basic', 'premium'];
    const userIndex = levels.indexOf(userLevel);
    const requiredIndex = levels.indexOf(requiredLevel);
    return userIndex >= requiredIndex;
}
