/**
 * Firebase Authentication Service
 * 
 * Provides Google OAuth authentication functionality.
 */

import {
    GoogleAuthProvider,
    signInWithPopup,
    signInWithCredential, // Add this import
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
            const googleIdToken = urlObj.searchParams.get('id_token');
            const googleAccessToken = urlObj.searchParams.get('access_token');

            const auth = getFirebaseAuth();

            if (token) {
                console.log('[Auth] Found custom token in deep link, signing in...');
                await signInWithCustomToken(auth, token);
                console.log('[Auth] Signed in with custom token');
            } else if (googleIdToken) {
                console.log('[Auth] Found Google credentials in deep link, signing in...');
                const credential = GoogleAuthProvider.credential(googleIdToken, googleAccessToken);
                await signInWithCredential(auth, credential);
                console.log('[Auth] Signed in with Google credential');
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

    // In Electron, we prefer the external browser flow for a better UX on macOS
    if (isElectron) {
        console.log('[Auth] Electron detected, using external browser flow...');
        try {
            await signInWithBrowser();
            // User will arrive via deep link
            throw new Error('Please complete sign in in your browser.');
        } catch (error: any) {
            if (error.message === 'No auth redirect URL configured') {
                // Fallback to popup if browser flow isn't configured, though not ideal
                console.warn('[Auth] Browser flow not configured, falling back to popup.');
            } else {
                throw error;
            }
        }
    }

    try {
        const auth = getFirebaseAuth();
        console.log('[Auth] Starting sign in with popup...');
        const result = await signInWithPopup(auth, googleProvider);
        return result.user;
    } catch (error: any) {
        // ... rest of the existing error handling
        if (error.code === 'auth/popup-closed-by-user') {
            console.log('Sign-in popup was closed by user');
            return null;
        }
        if (error.code === 'auth/popup-blocked') {
            console.error('Sign-in popup was blocked.');
            if (isElectron) {
                await signInWithBrowser();
                throw new Error('Please complete sign in in your browser.');
            }
            throw new Error('Popup blocked. Please allow popups and try again.');
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
        const electronAPI = (window as any).electronAPI;
        if (electronAPI?.openExternal) {
            electronAPI.openExternal(targetUrl.toString());
        } else {
            window.open(targetUrl.toString(), '_blank');
        }
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
