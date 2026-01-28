/**
 * useSync Hook
 * 
 * Provides sync state and controls to React components.
 */

import { useState, useEffect, useCallback } from 'react';
import { syncService, syncQueue, type SyncStatus, type SyncStats } from '@/lib/sync';
import { useAuth } from '@/components/auth';

interface UseSyncReturn {
    // Status
    status: SyncStatus;
    isActive: boolean;
    isSyncing: boolean;
    
    // Stats
    lastSyncTime: number;
    pendingCount: number;
    
    // Actions
    syncNow: () => Promise<SyncStats | null>;
    fullSync: () => Promise<SyncStats | null>;
    
    // Error
    error: Error | null;
}

/**
 * Hook to access sync state and controls
 */
export function useSync(): UseSyncReturn {
    const { user } = useAuth();
    const [status, setStatus] = useState<SyncStatus>('idle');
    const [lastSyncTime, setLastSyncTime] = useState(0);
    const [pendingCount, setPendingCount] = useState(0);
    const [error, setError] = useState<Error | null>(null);

    // Update state from sync service
    useEffect(() => {
        // Set initial values
        setStatus(syncService.getStatus());
        setLastSyncTime(syncService.getLastSyncTime());
        setPendingCount(syncQueue.getPendingCount());

        // Poll for updates (since syncService doesn't have native subscriptions)
        const interval = setInterval(() => {
            setStatus(syncService.getStatus());
            setLastSyncTime(syncService.getLastSyncTime());
            setPendingCount(syncQueue.getPendingCount());
        }, 1000);

        return () => clearInterval(interval);
    }, [user]);

    // Sync now (delta)
    const syncNow = useCallback(async (): Promise<SyncStats | null> => {
        if (!syncService.isActive) return null;
        
        setError(null);
        try {
            const stats = await syncService.pullDelta();
            setLastSyncTime(stats.lastSyncTime);
            return stats;
        } catch (err) {
            setError(err as Error);
            return null;
        }
    }, []);

    // Full sync
    const fullSync = useCallback(async (): Promise<SyncStats | null> => {
        if (!syncService.isActive) return null;
        
        setError(null);
        try {
            const stats = await syncService.fullSync();
            setLastSyncTime(stats.lastSyncTime);
            return stats;
        } catch (err) {
            setError(err as Error);
            return null;
        }
    }, []);

    return {
        status,
        isActive: syncService.isActive,
        isSyncing: status === 'syncing',
        lastSyncTime,
        pendingCount,
        syncNow,
        fullSync,
        error,
    };
}
