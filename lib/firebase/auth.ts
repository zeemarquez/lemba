/**
 * Firebase Authentication Service
 * 
 * Provides Google OAuth authentication functionality.
 */

import {
    GoogleAuthProvider,
    signInWithPopup,
    signInWithCustomToken,
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

// Handle Deep Links for Auth (Electron only)
if (typeof window !== 'undefined' && (window as any).electronAPI?.onDeepLink) {
    (window as any).electronAPI.onDeepLink(async (url: string) => {
        console.log('[Auth] Received deep link:', url);
        try {
            // Support hash routing if used
            const actualUrl = url.replace('/#', '');
            const urlObj = new URL(actualUrl);
            const token = urlObj.searchParams.get('token');

            if (token) {
                console.log('[Auth] Found token in deep link, signing in...');
                const auth = getFirebaseAuth();
                await signInWithCustomToken(auth, token);
                console.log('[Auth] Signed in with custom token');
            } else {
                console.warn('[Auth] No token found in deep link URL');
            }
        } catch (error) {
            console.error('[Auth] Error handling deep link:', error);
        }
    });
}

/**
 * Sign in with Google OAuth
 * @returns The authenticated user or null if failed
 */
export async function signInWithGoogle(): Promise<User | null> {
    if (!isFirebaseConfigured()) {
        console.error('Firebase is not configured. Please set environment variables.');
        throw new Error('Firebase is not configured. Check your environment variables.');
    }

    const isElectron = typeof window !== 'undefined' && (window as any).electronAPI?.isElectron;

    try {
        const auth = getFirebaseAuth();
        console.log('[Auth] Starting sign in with popup...');
        const result = await signInWithPopup(auth, googleProvider);
        return result.user;
    } catch (error: any) {
        // Handle specific error codes
        if (error.code === 'auth/popup-closed-by-user') {
            console.log('Sign-in popup was closed by user');
            return null;
        }
        if (error.code === 'auth/popup-blocked') {
            console.error('Sign-in popup was blocked.');

            if (isElectron) {
                // Try to fallback to external browser if configured
                try {
                    await signInWithBrowser();
                    // If we get here, it means the browser opened successfully.
                    // However, we don't have the user yet. The user will arrive via deep link.
                    // We throw a specific error to let the UI know we are waiting.
                    throw new Error('Please complete sign in in your browser.');
                } catch (browserError: any) {
                    if (browserError.message === 'No auth redirect URL configured') {
                        throw new Error('Popup blocked. Please allow popups and try again.');
                    }
                    throw browserError;
                }
            }
            throw new Error('Popup blocked. Please allow popups and try again.');
        }

        console.error('Error signing in with Google:', error);

        // If in Electron and popup fails, suggest alternative
        if (isElectron) {
            console.warn('[Auth] Popup sign-in failed in Electron. This may be due to browser restrictions.');

            // If it's a network error or similar, maybe the external browser is better
            if (error.code === 'auth/network-request-failed') {
                try {
                    await signInWithBrowser();
                    throw new Error('Network error. Opening system browser to sign in...');
                } catch (browserErr) {
                    // Ignore fallback error if not configured
                }
            }

            throw new Error(`Sign-in failed: ${error.message}. If you are on Desktop, please ensure you have allowed the login window.`);
        }

        throw error;
    }
}

/**
 * Opens the system browser to the auth handler URL.
 * Required environment variable: NEXT_PUBLIC_AUTH_HANDLER_URL
 */
export async function signInWithBrowser(): Promise<void> {
    const { getAuthHandlerUrl } = await import('./config');
    const authHandlerUrl = getAuthHandlerUrl();

    if (!authHandlerUrl) {
        console.warn('No auth handler URL configured (NEXT_PUBLIC_AUTH_HANDLER_URL)');
        throw new Error('No auth redirect URL configured');
    }

    console.log('[Auth] Opening external browser for sign-in:', authHandlerUrl);

    // Pass a state or return URL if needed by the handler
    // e.g. ?redirect_uri=modern-markdown-editor://auth
    const targetUrl = new URL(authHandlerUrl);
    targetUrl.searchParams.set('redirect_uri', 'modern-markdown-editor://auth');

    // Open external link
    // usage of window.open in Electron with shell.openExternal logic handled by main process
    // In Electron, _blank with a URL triggers the setWindowOpenHandler or will-navigate
    // We want to force it to open in default browser
    if (typeof window !== 'undefined') {
        window.open(targetUrl.toString(), '_blank');
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
        return () => { }; // Return no-op unsubscribe
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
