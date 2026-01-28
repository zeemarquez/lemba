/**
 * Cloud Sync Service
 * 
 * Orchestrates synchronization between IndexedDB (local) and Firebase (cloud).
 * Implements a parallel/sidecar architecture where IndexedDB is the primary store.
 * 
 * Features:
 * - Background push of local changes to cloud
 * - Periodic pull of remote changes (every 5 minutes)
 * - Hydration on first login
 * - Last-Write-Wins (LWW) conflict resolution
 * 
 * Note: Only text-based files (markdown, templates) are synced.
 * Images and fonts remain local-only (no Firebase Storage on free tier).
 */

import { browserStorage } from '../browser-storage';
import { FileEntry } from '../types';
import {
    isFirebaseConfigured,
    // Firestore operations
    saveFile as saveFileToCloud,
    getFilesUpdatedSince as getCloudFilesUpdatedSince,
    getAllFiles as getAllCloudFiles,
} from '../firebase';

// Sync interval in milliseconds (1 minute)
const SYNC_INTERVAL_MS = 1 * 60 * 1000;

// Local storage key for last sync timestamp
const LAST_SYNC_KEY = 'markdown-editor-last-sync';

// Sync status types
export type SyncStatus = 'idle' | 'syncing' | 'error' | 'offline';

// Sync event callbacks
export interface SyncEventCallbacks {
    onSyncStart?: () => void;
    onSyncComplete?: (stats: SyncStats) => void;
    onSyncError?: (error: Error) => void;
    onStatusChange?: (status: SyncStatus) => void;
}

// Sync statistics
export interface SyncStats {
    filesUploaded: number;
    filesDownloaded: number;
    lastSyncTime: number;
}

/**
 * Cloud Sync Service
 */
class SyncService {
    private userId: string | null = null;
    private syncInterval: ReturnType<typeof setInterval> | null = null;
    private status: SyncStatus = 'idle';
    private lastSyncTimestamp: number = 0;
    private callbacks: SyncEventCallbacks = {};
    private isSyncing: boolean = false;

    /**
     * Initialize the sync service with a user ID
     */
    start(userId: string, callbacks?: SyncEventCallbacks): void {
        if (!isFirebaseConfigured()) {
            console.warn('Firebase not configured, sync disabled');
            return;
        }

        this.userId = userId;
        this.callbacks = callbacks || {};
        this.lastSyncTimestamp = this.getLastSyncTimestamp();

        // Start periodic sync
        this.syncInterval = setInterval(() => {
            this.pullDelta();
        }, SYNC_INTERVAL_MS);

        console.log('Sync service started for user:', userId);
    }

    /**
     * Stop the sync service
     */
    stop(): void {
        if (this.syncInterval) {
            clearInterval(this.syncInterval);
            this.syncInterval = null;
        }
        this.userId = null;
        this.setStatus('idle');
        console.log('Sync service stopped');
    }

    /**
     * Check if sync service is active
     */
    get isActive(): boolean {
        return this.userId !== null && isFirebaseConfigured();
    }

    /**
     * Get current sync status
     */
    getStatus(): SyncStatus {
        return this.status;
    }

    /**
     * Get last sync timestamp
     */
    getLastSyncTime(): number {
        return this.lastSyncTimestamp;
    }

    // ==================== Outbound Sync (Push to Cloud) ====================

    /**
     * Push a file to the cloud
     */
    async pushFile(entry: FileEntry): Promise<void> {
        if (!this.isActive || !this.userId) return;

        try {
            await saveFileToCloud(this.userId, entry);
        } catch (error) {
            console.error('Error pushing file to cloud:', error);
            throw error;
        }
    }

    // ==================== Inbound Sync (Pull from Cloud) ====================

    /**
     * Pull delta updates from the cloud
     */
    async pullDelta(): Promise<SyncStats> {
        console.log('[SyncService] pullDelta called, isActive:', this.isActive, 'userId:', this.userId, 'isSyncing:', this.isSyncing);
        
        if (!this.isActive || !this.userId || this.isSyncing) {
            console.log('[SyncService] pullDelta skipped - conditions not met');
            return this.createEmptyStats();
        }

        this.isSyncing = true;
        this.setStatus('syncing');
        this.callbacks.onSyncStart?.();

        const stats: SyncStats = {
            filesUploaded: 0,
            filesDownloaded: 0,
            lastSyncTime: Date.now(),
        };

        try {
            console.log('[SyncService] Fetching cloud files since:', this.lastSyncTimestamp);
            // Pull file changes
            const cloudFiles = await getCloudFilesUpdatedSince(
                this.userId,
                this.lastSyncTimestamp
            );
            console.log('[SyncService] Found', cloudFiles.length, 'files to sync');

            for (const cloudFile of cloudFiles) {
                console.log('[SyncService] Merging file:', cloudFile.path);
                await this.mergeFile(cloudFile);
                stats.filesDownloaded++;
            }

            // Update last sync timestamp
            this.lastSyncTimestamp = Date.now();
            this.saveLastSyncTimestamp(this.lastSyncTimestamp);

            this.setStatus('idle');
            console.log('[SyncService] pullDelta complete, calling onSyncComplete');
            this.callbacks.onSyncComplete?.(stats);

            return stats;
        } catch (error) {
            console.error('[SyncService] Error during delta sync:', error);
            this.setStatus('error');
            this.callbacks.onSyncError?.(error as Error);
            throw error;
        } finally {
            this.isSyncing = false;
        }
    }

    /**
     * Hydrate local storage from cloud on first login
     */
    async hydrate(): Promise<SyncStats> {
        console.log('[SyncService] hydrate called, isActive:', this.isActive, 'userId:', this.userId);
        
        if (!this.isActive || !this.userId) {
            console.log('[SyncService] hydrate skipped - conditions not met');
            return this.createEmptyStats();
        }

        this.isSyncing = true;
        this.setStatus('syncing');
        this.callbacks.onSyncStart?.();

        const stats: SyncStats = {
            filesUploaded: 0,
            filesDownloaded: 0,
            lastSyncTime: Date.now(),
        };

        try {
            // Get all local files
            const localFiles = await browserStorage.getAllFiles();
            console.log('[SyncService] Local files:', localFiles.length);

            // Get all cloud files
            const cloudFiles = await getAllCloudFiles(this.userId);
            console.log('[SyncService] Cloud files:', cloudFiles.length);

            // Merge files (LWW)
            const localFileSyncIds = new Set(localFiles.map(f => f.syncId));
            const cloudFileSyncIds = new Set(cloudFiles.map(f => f.syncId));

            // Download files that exist in cloud but not locally
            for (const cloudFile of cloudFiles) {
                if (!localFileSyncIds.has(cloudFile.syncId)) {
                    console.log('[SyncService] Downloading new file:', cloudFile.path);
                    await browserStorage.upsertFile(cloudFile);
                    stats.filesDownloaded++;
                } else {
                    // File exists in both - use LWW
                    console.log('[SyncService] Merging existing file:', cloudFile.path);
                    await this.mergeFile(cloudFile);
                    stats.filesDownloaded++;
                }
            }

            // Upload local files that don't exist in cloud
            for (const localFile of localFiles) {
                if (!cloudFileSyncIds.has(localFile.syncId)) {
                    console.log('[SyncService] Uploading local file:', localFile.path);
                    await saveFileToCloud(this.userId, localFile);
                    stats.filesUploaded++;
                }
            }

            // Update user ID on all local file entries
            await browserStorage.setUserIdForAllEntries(this.userId);

            // Update last sync timestamp
            this.lastSyncTimestamp = Date.now();
            this.saveLastSyncTimestamp(this.lastSyncTimestamp);

            this.setStatus('idle');
            console.log('[SyncService] hydrate complete, calling onSyncComplete');
            this.callbacks.onSyncComplete?.(stats);

            return stats;
        } catch (error) {
            console.error('[SyncService] Error during hydration:', error);
            this.setStatus('error');
            this.callbacks.onSyncError?.(error as Error);
            throw error;
        } finally {
            this.isSyncing = false;
        }
    }

    /**
     * Force a full sync (push all local changes, then pull all remote changes)
     */
    async fullSync(): Promise<SyncStats> {
        // Reset last sync timestamp to force full delta
        this.lastSyncTimestamp = 0;
        return this.hydrate();
    }

    // ==================== Private Helper Methods ====================

    /**
     * Merge a cloud file with local storage using LWW
     */
    private async mergeFile(cloudFile: FileEntry): Promise<void> {
        const localFile = await browserStorage.getFileBySyncId(cloudFile.syncId);

        // If no local file or cloud is newer, use cloud version
        if (!localFile || cloudFile.updatedAt > localFile.updatedAt) {
            if (cloudFile.isDeleted) {
                // Soft delete locally
                const existing = await browserStorage.getFileEntry(cloudFile.path);
                if (existing) {
                    await browserStorage.softDeleteFile(cloudFile.path);
                }
            } else {
                await browserStorage.upsertFile(cloudFile);
            }
        }
    }

    /**
     * Set sync status and notify callbacks
     */
    private setStatus(status: SyncStatus): void {
        this.status = status;
        this.callbacks.onStatusChange?.(status);
    }

    /**
     * Get last sync timestamp from localStorage
     */
    private getLastSyncTimestamp(): number {
        if (typeof window === 'undefined') return 0;
        
        const stored = localStorage.getItem(LAST_SYNC_KEY);
        if (!stored) return 0;
        
        try {
            const data = JSON.parse(stored);
            return data[this.userId || ''] || 0;
        } catch {
            return 0;
        }
    }

    /**
     * Save last sync timestamp to localStorage
     */
    private saveLastSyncTimestamp(timestamp: number): void {
        if (typeof window === 'undefined' || !this.userId) return;
        
        try {
            const stored = localStorage.getItem(LAST_SYNC_KEY);
            const data = stored ? JSON.parse(stored) : {};
            data[this.userId] = timestamp;
            localStorage.setItem(LAST_SYNC_KEY, JSON.stringify(data));
        } catch (error) {
            console.error('Error saving last sync timestamp:', error);
        }
    }

    /**
     * Create empty sync stats
     */
    private createEmptyStats(): SyncStats {
        return {
            filesUploaded: 0,
            filesDownloaded: 0,
            lastSyncTime: this.lastSyncTimestamp,
        };
    }
}

// Export singleton instance
export const syncService = new SyncService();
