/**
 * Firebase Module Exports
 * 
 * Centralized exports for all Firebase-related functionality.
 * 
 * Firestore sync for files and fonts; images remain local-only.
 */

// Configuration
export {
    isFirebaseConfigured,
    getFirebaseApp,
    getFirebaseAuth,
    getFirebaseFirestore,
    FIREBASE_APP_ID,
} from './config';

// Authentication
export {
    signInWithGoogle,
    signOut,
    getCurrentUser,
    getCurrentUserId,
    onAuthStateChanged,
    isAuthenticated,
    waitForAuthReady,
    type User,
} from './auth';

// Firestore Operations (files + fonts; images are local-only)
export {
    // Files
    saveFile,
    getFile,
    getAllFiles,
    getFilesUpdatedSince,
    deleteFile,
    batchSaveFiles,
    // Fonts
    saveFontEntry,
    getFontEntry,
    getAllFontEntries,
    getFontEntriesUpdatedSince,
    deleteFontEntry,
    MAX_FONT_BYTES_FOR_FIRESTORE,
    // Real-time (future)
    subscribeToFileChanges,
    // Types
    type FirestoreFileEntry,
    type FirestoreFontEntry,
} from './firestore';

// User Access Management
export {
    getUserAccessLevel,
    getUserAccess,
    createUserAccessRecord,
    hasSyncAccess,
    hasAccessLevel,
    type UserAccessLevel,
    type UserAccess,
} from './user-access';
