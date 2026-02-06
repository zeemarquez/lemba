'use client';

/**
 * Auth Provider Component
 * 
 * Provides authentication context to the application.
 * Handles Firebase Auth state and sync service initialization.
 * Manages user access levels (basic/premium) for feature gating.
 */

import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import {
    onAuthStateChanged,
    signInWithGoogle,
    signOut as firebaseSignOut,
    isFirebaseConfigured,
    getUserAccessLevel,
    type User,
    type UserAccessLevel,
} from '@/lib/firebase';
import { syncService } from '@/lib/sync';
import { useStore } from '@/lib/store';
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from '@/components/ui/alert-dialog';

// Auth context type
interface AuthContextType {
    user: User | null;
    isLoading: boolean;
    isConfigured: boolean;
    accessLevel: UserAccessLevel | null;
    hasSyncAccess: boolean;
    signIn: () => Promise<void>;
    signOut: () => Promise<void>;
    error: string | null;
}

// Create context with default values
const AuthContext = createContext<AuthContextType>({
    user: null,
    isLoading: true,
    isConfigured: false,
    accessLevel: null,
    hasSyncAccess: false,
    signIn: async () => { },
    signOut: async () => { },
    error: null,
});

// Hook to use auth context
export function useAuth() {
    const context = useContext(AuthContext);
    if (!context) {
        throw new Error('useAuth must be used within an AuthProvider');
    }
    return context;
}

// Provider props
interface AuthProviderProps {
    children: React.ReactNode;
}

/**
 * Auth Provider Component
 */
export function AuthProvider({ children }: AuthProviderProps) {
    const [user, setUser] = useState<User | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [isConfigured] = useState(() => isFirebaseConfigured());
    const [accessLevel, setAccessLevel] = useState<UserAccessLevel | null>(null);
    const [showBasicUserPopup, setShowBasicUserPopup] = useState(false);
    const previousUserRef = useRef<User | null>(null);
    const isInitialMountRef = useRef(true);

    // Compute if user has sync access (premium only)
    const hasSyncAccess = accessLevel === 'premium';

    // Helper function to check if user has seen the popup
    const hasSeenPopup = (userId: string): boolean => {
        const key = `basic-account-popup-seen-${userId}`;
        return localStorage.getItem(key) === 'true';
    };

    // Helper function to mark popup as seen
    const markPopupAsSeen = (userId: string): void => {
        const key = `basic-account-popup-seen-${userId}`;
        localStorage.setItem(key, 'true');
    };

    // Listen for auth state changes
    useEffect(() => {
        console.log('[AuthProvider] isConfigured:', isConfigured);
        if (!isConfigured) {
            console.warn('[AuthProvider] Firebase not configured, skipping auth listener.');
            setIsLoading(false);
            return;
        }

        const unsubscribe = onAuthStateChanged(async (user) => {
            // Check if this is a fresh sign-in (transition from no user to user)
            // Only consider it fresh if it's not the initial mount
            const isFreshSignIn = !isInitialMountRef.current && !previousUserRef.current && user !== null;

            setUser(user);
            previousUserRef.current = user;

            // Mark that initial mount is complete after first auth state check
            if (isInitialMountRef.current) {
                isInitialMountRef.current = false;
            }

            // Initialize or stop sync service based on auth state and access level
            if (user) {
                // Check user access level
                const level = await getUserAccessLevel(user.uid);
                setAccessLevel(level);
                console.log('[Auth] User access level:', level);

                // Only enable sync for premium users
                if (level === 'premium') {
                    const refreshStore = () => {
                        console.log('[Sync] Refreshing store after sync...');
                        useStore.getState().fetchFileTree();
                        useStore.getState().fetchTemplates();
                    };

                    syncService.start(user.uid, {
                        onSyncError: (err) => {
                            console.error('[Sync] Error:', err);
                        },
                        onSyncComplete: (stats) => {
                            console.log('[Sync] Complete:', stats);
                            refreshStore();
                        },
                    });

                    // Hydrate on first login (check if this is first sync)
                    const lastSync = syncService.getLastSyncTime();
                    console.log('[Sync] Last sync timestamp:', lastSync);

                    if (lastSync === 0) {
                        console.log('[Sync] First sync - running hydrate...');
                        syncService.hydrate()
                            .then((stats) => {
                                console.log('[Sync] Hydrate completed:', stats);
                                refreshStore();
                            })
                            .catch((err) => {
                                console.error('[Sync] Hydrate failed:', err);
                            });
                    } else {
                        console.log('[Sync] Running delta sync...');
                        syncService.pullDelta()
                            .then((stats) => {
                                console.log('[Sync] Delta sync completed:', stats);
                                refreshStore();
                            })
                            .catch((err) => {
                                console.error('[Sync] Delta sync failed:', err);
                            });
                    }
                } else {
                    // Basic user - show popup only on fresh sign-in and if not seen before
                    console.log('[Auth] Basic user - sync disabled');
                    syncService.stop();

                    if (isFreshSignIn && !hasSeenPopup(user.uid)) {
                        setShowBasicUserPopup(true);
                    }
                }
            } else {
                setAccessLevel(null);
                syncService.stop();
            }

            setIsLoading(false);
        });

        return () => unsubscribe();
    }, [isConfigured]);

    // Sign in with Google
    const signIn = useCallback(async () => {
        if (!isConfigured) {
            setError('Firebase is not configured. Please add environment variables.');
            return;
        }

        setError(null);
        try {
            await signInWithGoogle();
        } catch (err: any) {
            setError(err.message || 'Failed to sign in');
            throw err;
        }
    }, [isConfigured]);

    // Sign out
    const signOut = useCallback(async () => {
        if (!isConfigured) return;

        setError(null);
        try {
            syncService.stop();
            await firebaseSignOut();
        } catch (err: any) {
            setError(err.message || 'Failed to sign out');
            throw err;
        }
    }, [isConfigured]);

    const value: AuthContextType = {
        user,
        isLoading,
        isConfigured,
        accessLevel,
        hasSyncAccess,
        signIn,
        signOut,
        error,
    };

    return (
        <AuthContext.Provider value={value}>
            {children}

            {/* Basic User Popup - shown when a basic user signs in */}
            <AlertDialog open={showBasicUserPopup} onOpenChange={(open) => {
                setShowBasicUserPopup(open);
                if (!open && user) {
                    // Mark popup as seen when closed
                    markPopupAsSeen(user.uid);
                }
            }}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Basic Account</AlertDialogTitle>
                        <AlertDialogDescription>
                            You are signed in with a Basic account. Cloud sync is not available
                            for Basic users. Your documents will only be saved locally on this device.
                            <br /><br />
                            Upgrade to Premium to enable cloud sync and access your documents
                            from any device.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogAction onClick={() => {
                            setShowBasicUserPopup(false);
                            if (user) {
                                markPopupAsSeen(user.uid);
                            }
                        }}>
                            Got it
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </AuthContext.Provider>
    );
}
