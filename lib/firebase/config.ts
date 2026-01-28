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

// Helper to get environment variable from either process.env or electronAPI
const getEnvVar = (key: string): string | undefined => {
    // 1. Try process.env (Next.js build-time inlining)
    if (process.env[key]) return process.env[key];

    // 2. Try window.electronAPI.env (Electron runtime)
    if (typeof window !== 'undefined' && (window as any).electronAPI?.env?.[key]) {
        return (window as any).electronAPI.env[key];
    }

    return undefined;
};

// Firebase configuration from environment variables
const firebaseConfig = {
    apiKey: getEnvVar('NEXT_PUBLIC_FIREBASE_API_KEY'),
    authDomain: getEnvVar('NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN'),
    projectId: getEnvVar('NEXT_PUBLIC_FIREBASE_PROJECT_ID'),
    storageBucket: getEnvVar('NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET'),
    messagingSenderId: getEnvVar('NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID'),
    appId: getEnvVar('NEXT_PUBLIC_FIREBASE_APP_ID'),
};

// App ID for Firestore document structure (can be customized per deployment)
export const FIREBASE_APP_ID = getEnvVar('NEXT_PUBLIC_FIREBASE_CUSTOM_APP_ID') || 'modern-markdown-editor';

// Initialize Firebase (singleton pattern)
let app: FirebaseApp;
let auth: Auth;
let db: Firestore;

function initializeFirebase() {
    if (getApps().length === 0) {
        app = initializeApp(firebaseConfig);
    } else {
        app = getApp();
    }

    auth = getAuth(app);
    db = getFirestore(app);

    return { app, auth, db };
}

// Check if Firebase is configured
export function isFirebaseConfigured(): boolean {
    return !!(
        firebaseConfig.apiKey &&
        firebaseConfig.authDomain &&
        firebaseConfig.projectId
    );
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

// Export initialized instances (for convenience)
export { app, auth, db };
