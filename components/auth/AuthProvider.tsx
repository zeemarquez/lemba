'use client';

/**
 * Auth Provider Component
 * 
 * Provides authentication context to the application.
 * Handles Firebase Auth state and sync service initialization.
 */

import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import {
    onAuthStateChanged,
    signInWithGoogle,
    signOut as firebaseSignOut,
    isFirebaseConfigured,
    type User,
} from '@/lib/firebase';
import { syncService } from '@/lib/sync';
import { useStore } from '@/lib/store';

// Auth context type
interface AuthContextType {
    user: User | null;
    isLoading: boolean;
    isConfigured: boolean;
    signIn: () => Promise<void>;
    signOut: () => Promise<void>;
    error: string | null;
}

// Create context with default values
const AuthContext = createContext<AuthContextType>({
    user: null,
    isLoading: true,
    isConfigured: false,
    signIn: async () => {},
    signOut: async () => {},
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

    // Listen for auth state changes
    useEffect(() => {
        if (!isConfigured) {
            setIsLoading(false);
            return;
        }

        const unsubscribe = onAuthStateChanged((user) => {
            setUser(user);
            setIsLoading(false);

            // Initialize or stop sync service based on auth state
            if (user) {
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
                syncService.stop();
            }
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
        signIn,
        signOut,
        error,
    };

    return (
        <AuthContext.Provider value={value}>
            {children}
        </AuthContext.Provider>
    );
}
