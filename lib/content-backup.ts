/**
 * Content Backup Utilities
 * Lightweight backup system for recovery when applying AI diffs or other destructive operations.
 */

const BACKUP_PREFIX = 'markdown-editor-backup-';

/**
 * Save current file content as a backup before applying a diff.
 * Uses localStorage with one backup per file (overwrites previous).
 */
export function saveBackupBeforeApply(fileId: string, content: string): void {
    if (typeof window === 'undefined') return;
    try {
        const key = `${BACKUP_PREFIX}${fileId}`;
        const entry = {
            content,
            savedAt: Date.now(),
        };
        localStorage.setItem(key, JSON.stringify(entry));
    } catch (e) {
        console.warn('[ContentBackup] Failed to save backup:', e);
    }
}

/**
 * Get the last backup for a file, if any.
 */
export function getLastBackup(fileId: string): { content: string; savedAt: number } | null {
    if (typeof window === 'undefined') return null;
    try {
        const key = `${BACKUP_PREFIX}${fileId}`;
        const raw = localStorage.getItem(key);
        if (!raw) return null;
        const entry = JSON.parse(raw);
        if (entry && typeof entry.content === 'string' && typeof entry.savedAt === 'number') {
            return { content: entry.content, savedAt: entry.savedAt };
        }
        return null;
    } catch {
        return null;
    }
}

/**
 * Restore file content from the last backup.
 * Returns the restored content, or null if no backup exists.
 */
export function restoreFromBackup(fileId: string): string | null {
    const backup = getLastBackup(fileId);
    return backup ? backup.content : null;
}
