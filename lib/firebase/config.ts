/**
 * Firebase Configuration
 * 
 * This module initializes Firebase with your project configuration.
 * Environment variables should be set in a .env.local file.
 * 
 * Note: This implementation uses only Firestore (free tier compatible).
 * Firebase Storage is NOT used to stay within the free Spark plan.
 * Only text-based files (markdown, templates) are synced to the cloud.
 * Images and fonts remain local-only.
 */

import { initializeApp, getApps, getApp, FirebaseApp } from 'firebase/app';
import { getAuth, Auth } from 'firebase/auth';
import { getFirestore, Firestore } from 'firebase/firestore';

// Helper to get environment variable from electronAPI (runtime)
const getElectronEnv = (key: string): string | undefined => {
    if (typeof window !== 'undefined' && (window as any).electronAPI?.env?.[key]) {
        return (window as any).electronAPI.env[key];
    }
    return undefined;
};

// Explicitly access process.env to allow Next.js to inline values at build time.
// Dynamic access (process.env[key]) DOES NOT work for Client Components.
const apiKey = process.env.NEXT_PUBLIC_FIREBASE_API_KEY || getElectronEnv('NEXT_PUBLIC_FIREBASE_API_KEY');
const authDomain = process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN || getElectronEnv('NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN');
const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || getElectronEnv('NEXT_PUBLIC_FIREBASE_PROJECT_ID');
const storageBucket = process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || getElectronEnv('NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET');
const messagingSenderId = process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || getElectronEnv('NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID');
const appId = process.env.NEXT_PUBLIC_FIREBASE_APP_ID || getElectronEnv('NEXT_PUBLIC_FIREBASE_APP_ID');

const customAppId = process.env.NEXT_PUBLIC_FIREBASE_CUSTOM_APP_ID || getElectronEnv('NEXT_PUBLIC_FIREBASE_CUSTOM_APP_ID');
const authHandlerUrl = process.env.NEXT_PUBLIC_AUTH_HANDLER_URL || getElectronEnv('NEXT_PUBLIC_AUTH_HANDLER_URL');

console.log('[Firebase Config] Initializing with:', {
    hasApiKey: !!apiKey,
    hasAuthDomain: !!authDomain,
    hasProjectId: !!projectId,
    authHandlerUrl,
    isElectron: typeof window !== 'undefined' && !!(window as any).electronAPI
});

// Firebase configuration
const firebaseConfig = {
    apiKey,
    authDomain,
    projectId,
    storageBucket,
    messagingSenderId,
    appId,
    // Not part of firebase config but useful to expose here
    authHandlerUrl,
};

// App ID for Firestore document structure (can be customized per deployment)
export const FIREBASE_APP_ID = customAppId || 'modern-markdown-editor';

// Initialize Firebase (singleton pattern)
let app: FirebaseApp;
let auth: Auth;
let db: Firestore;

function initializeFirebase() {
    try {
        if (getApps().length === 0) {
            console.log('[Firebase Config] Initializing new app instance');
            app = initializeApp(firebaseConfig);
        } else {
            console.log('[Firebase Config] Using existing app instance');
            app = getApp();
        }

        auth = getAuth(app);
        db = getFirestore(app);

        return { app, auth, db };
    } catch (error) {
        console.error('[Firebase Config] Initialization failed:', error);
        throw error;
    }
}

// Check if Firebase is configured
export function isFirebaseConfigured(): boolean {
    const isConfigured = !!(
        firebaseConfig.apiKey &&
        firebaseConfig.authDomain &&
        firebaseConfig.projectId
    );

    if (!isConfigured) {
        console.warn('[Firebase Config] Missing required configuration. Check your .env.local file.');
    }

    return isConfigured;
}

// Lazy initialization
export function getFirebaseApp(): FirebaseApp {
    if (!app) initializeFirebase();
    return app;
}

export function getFirebaseAuth(): Auth {
    if (!auth) initializeFirebase();
    return auth;
}

export function getFirebaseFirestore(): Firestore {
    if (!db) initializeFirebase();
    return db;
}


export function getAuthHandlerUrl(): string | undefined {
    return firebaseConfig.authHandlerUrl;
}

// Export initialized instances (for convenience)
export { app, auth, db };
