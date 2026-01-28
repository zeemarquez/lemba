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

// Firebase configuration from environment variables
const firebaseConfig = {
    apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
    authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
    storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
    appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

// App ID for Firestore document structure (can be customized per deployment)
export const FIREBASE_APP_ID = process.env.NEXT_PUBLIC_FIREBASE_CUSTOM_APP_ID || 'modern-markdown-editor';

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
