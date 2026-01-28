/**
 * Sync Queue
 * 
 * Manages a queue of pending sync operations for offline support.
 * Operations are persisted to localStorage and processed when online.
 * 
 * Note: Only files are synced (images and fonts remain local-only).
 */

import { FileEntry } from '../types';
import { syncService } from './sync-service';

// Queue storage key
const SYNC_QUEUE_KEY = 'markdown-editor-sync-queue';

// Operation types (only files are synced)
export type SyncOperationType = 'file';

export interface SyncQueueItem {
    id: string;
    type: SyncOperationType;
    syncId: string;
    timestamp: number;
    retries: number;
}

/**
 * Sync Queue Manager
 */
class SyncQueue {
    private queue: SyncQueueItem[] = [];
    private isProcessing: boolean = false;
    private maxRetries: number = 3;

    constructor() {
        this.loadQueue();
        
        // Listen for online events to process queue
        if (typeof window !== 'undefined') {
            window.addEventListener('online', () => {
                this.processQueue();
            });
        }
    }

    /**
     * Add a file to the sync queue
     */
    enqueueFile(entry: FileEntry): void {
        this.addToQueue({
            id: `file-${entry.syncId}-${Date.now()}`,
            type: 'file',
            syncId: entry.syncId,
            timestamp: Date.now(),
            retries: 0,
        });
    }

    /**
     * Get pending queue size
     */
    getPendingCount(): number {
        return this.queue.length;
    }

    /**
     * Check if queue has pending items
     */
    hasPending(): boolean {
        return this.queue.length > 0;
    }

    /**
     * Process all queued items
     */
    async processQueue(): Promise<void> {
        if (this.isProcessing || this.queue.length === 0) return;
        if (!syncService.isActive) return;
        if (typeof navigator !== 'undefined' && !navigator.onLine) return;

        this.isProcessing = true;

        // Process queue items in order
        const itemsToProcess = [...this.queue];
        
        for (const item of itemsToProcess) {
            try {
                await this.processItem(item);
                this.removeFromQueue(item.id);
            } catch (error) {
                console.error(`Error processing queue item ${item.id}:`, error);
                
                // Increment retry count
                item.retries++;
                
                if (item.retries >= this.maxRetries) {
                    console.error(`Max retries reached for item ${item.id}, removing from queue`);
                    this.removeFromQueue(item.id);
                } else {
                    this.updateQueueItem(item);
                }
            }
        }

        this.isProcessing = false;
    }

    /**
     * Clear the queue
     */
    clear(): void {
        this.queue = [];
        this.saveQueue();
    }

    // ==================== Private Methods ====================

    /**
     * Add item to queue
     */
    private addToQueue(item: SyncQueueItem): void {
        // Remove any existing item for the same syncId to avoid duplicates
        this.queue = this.queue.filter(
            i => !(i.type === item.type && i.syncId === item.syncId)
        );
        
        this.queue.push(item);
        this.saveQueue();

        // Try to process immediately if online
        this.processQueue();
    }

    /**
     * Remove item from queue
     */
    private removeFromQueue(id: string): void {
        this.queue = this.queue.filter(i => i.id !== id);
        this.saveQueue();
    }

    /**
     * Update an item in the queue
     */
    private updateQueueItem(item: SyncQueueItem): void {
        const index = this.queue.findIndex(i => i.id === item.id);
        if (index !== -1) {
            this.queue[index] = item;
            this.saveQueue();
        }
    }

    /**
     * Process a single queue item
     */
    private async processItem(item: SyncQueueItem): Promise<void> {
        const { browserStorage } = await import('../browser-storage');

        switch (item.type) {
            case 'file': {
                const entry = await browserStorage.getFileBySyncId(item.syncId);
                if (entry) {
                    await syncService.pushFile(entry);
                }
                break;
            }
        }
    }

    /**
     * Load queue from localStorage
     */
    private loadQueue(): void {
        if (typeof window === 'undefined') return;

        try {
            const stored = localStorage.getItem(SYNC_QUEUE_KEY);
            if (stored) {
                this.queue = JSON.parse(stored);
            }
        } catch (error) {
            console.error('Error loading sync queue:', error);
            this.queue = [];
        }
    }

    /**
     * Save queue to localStorage
     */
    private saveQueue(): void {
        if (typeof window === 'undefined') return;

        try {
            localStorage.setItem(SYNC_QUEUE_KEY, JSON.stringify(this.queue));
        } catch (error) {
            console.error('Error saving sync queue:', error);
        }
    }
}

// Export singleton instance
export const syncQueue = new SyncQueue();
