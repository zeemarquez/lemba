/**
 * Firebase Authentication Service
 * 
 * Provides Google OAuth authentication functionality.
 */

import {
    GoogleAuthProvider,
    signInWithPopup,
    signOut as firebaseSignOut,
    onAuthStateChanged as firebaseOnAuthStateChanged,
    User,
    Unsubscribe,
} from 'firebase/auth';
import { getFirebaseAuth, isFirebaseConfigured } from './config';

// Google Auth Provider
const googleProvider = new GoogleAuthProvider();
googleProvider.addScope('email');
googleProvider.addScope('profile');

/**
 * Sign in with Google OAuth
 * @returns The authenticated user or null if failed
 */
export async function signInWithGoogle(): Promise<User | null> {
    if (!isFirebaseConfigured()) {
        console.error('Firebase is not configured. Please set environment variables.');
        return null;
    }

    try {
        const auth = getFirebaseAuth();
        const result = await signInWithPopup(auth, googleProvider);
        return result.user;
    } catch (error: any) {
        // Handle specific error codes
        if (error.code === 'auth/popup-closed-by-user') {
            console.log('Sign-in popup was closed by user');
            return null;
        }
        if (error.code === 'auth/popup-blocked') {
            console.error('Sign-in popup was blocked. Please allow popups for this site.');
            throw new Error('Popup blocked. Please allow popups and try again.');
        }
        console.error('Error signing in with Google:', error);
        throw error;
    }
}

/**
 * Sign out the current user
 */
export async function signOut(): Promise<void> {
    if (!isFirebaseConfigured()) {
        console.error('Firebase is not configured.');
        return;
    }

    try {
        const auth = getFirebaseAuth();
        await firebaseSignOut(auth);
    } catch (error) {
        console.error('Error signing out:', error);
        throw error;
    }
}

/**
 * Get the current authenticated user
 * @returns The current user or null if not authenticated
 */
export function getCurrentUser(): User | null {
    if (!isFirebaseConfigured()) {
        return null;
    }

    const auth = getFirebaseAuth();
    return auth.currentUser;
}

/**
 * Get the current user's UID
 * @returns The user's UID or null if not authenticated
 */
export function getCurrentUserId(): string | null {
    const user = getCurrentUser();
    return user?.uid || null;
}

/**
 * Subscribe to auth state changes
 * @param callback Function called when auth state changes
 * @returns Unsubscribe function
 */
export function onAuthStateChanged(
    callback: (user: User | null) => void
): Unsubscribe {
    if (!isFirebaseConfigured()) {
        // Call callback immediately with null if not configured
        callback(null);
        return () => {}; // Return no-op unsubscribe
    }

    const auth = getFirebaseAuth();
    return firebaseOnAuthStateChanged(auth, callback);
}

/**
 * Check if a user is currently authenticated
 * @returns True if user is authenticated
 */
export function isAuthenticated(): boolean {
    return getCurrentUser() !== null;
}

/**
 * Wait for auth to be ready (initial auth state to be determined)
 * @returns Promise that resolves with the current user or null
 */
export function waitForAuthReady(): Promise<User | null> {
    if (!isFirebaseConfigured()) {
        return Promise.resolve(null);
    }

    return new Promise((resolve) => {
        const auth = getFirebaseAuth();
        const unsubscribe = firebaseOnAuthStateChanged(auth, (user) => {
            unsubscribe();
            resolve(user);
        });
    });
}

// Re-export User type for convenience
export type { User };
