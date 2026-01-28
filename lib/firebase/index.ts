/**
 * Firebase Module Exports
 * 
 * Centralized exports for all Firebase-related functionality.
 * 
 * Note: This implementation uses only Firestore (free tier compatible).
 * Firebase Storage is NOT used - images and fonts remain local-only.
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

// Firestore Operations (Files only - images/fonts are local-only)
export {
    // Files
    saveFile,
    getFile,
    getAllFiles,
    getFilesUpdatedSince,
    deleteFile,
    batchSaveFiles,
    // Real-time (future)
    subscribeToFileChanges,
    // Types
    type FirestoreFileEntry,
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
