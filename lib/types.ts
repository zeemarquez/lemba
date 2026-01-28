// ==================== Sync Metadata ====================

/**
 * Base sync metadata for all syncable entities.
 * Used for cloud sync with Firebase.
 */
export interface SyncMetadata {
    syncId: string;        // UUID for cloud sync (separate from path/id)
    updatedAt: number;     // Timestamp for Last-Write-Wins (LWW)
    isDeleted: boolean;    // Soft delete flag for sync
    userId: string | null; // Owner's Firebase UID (null if local-only)
}

/**
 * Generates a new sync ID (UUID v4)
 */
export function generateSyncId(): string {
    return crypto.randomUUID();
}

// ==================== File System Types ====================

export interface FileNode {
    id: string; // relative path
    name: string;
    type: 'file' | 'folder';
    children?: FileNode[];
}

export interface AppStateFile {
    id: string; // relative path
    name: string;
    content: string;
    language: string;
}

export interface HeadingStyle {
    fontSize: string;
    color: string;
    textAlign: 'left' | 'center' | 'right';
    borderBottom: boolean;
    textTransform: 'none' | 'uppercase' | 'capitalize';
    fontWeight: string;
    fontStyle: string;
    textDecoration: string;
    numbering: {
        enabled: boolean;
        style: 'decimal' | 'decimal-leading-zero' | 'lower-roman' | 'upper-roman' | 'lower-alpha' | 'upper-alpha';
        separator: string;
        prefix: string;
        suffix: string;
    };
}

// Document variable definition (name only, value is per-document)
export interface TemplateVariable {
    id: string;
    name: string;
}

export interface Template {
    id: string;
    name: string;
    css: string;
    settings: {
        fontFamily: string;
        fontSize: string;
        textColor: string;
        backgroundColor: string;
        pageLayout: 'vertical' | 'horizontal';
        pageSize?: {
            preset?: string; // e.g., 'a4', 'letter', 'a3', etc.
            custom?: {
                width: string; // e.g., '210mm'
                height: string; // e.g., '297mm'
            };
        };
        margins: {
            top: string;
            bottom: string;
            left: string;
            right: string;
        };
        startPageNumber?: number;
        watermark?: string;
        variables?: TemplateVariable[];
        h1: HeadingStyle;
        h2: HeadingStyle;
        h3: HeadingStyle;
        h4: HeadingStyle;
        h5: HeadingStyle;
        h6: HeadingStyle;
        header?: {
            enabled: boolean;
            content: string;
            startPage: number;
            margins: {
                bottom: string;
                left: string;
                right: string;
            };
        };
        footer?: {
            enabled: boolean;
            content: string;
            startPage: number;
            margins: {
                top: string;
                left: string;
                right: string;
            };
        };
        frontPage?: {
            enabled: boolean;
            content: string;
            emptyPagesAfter?: number;
        };
        codeBlockTheme?: string;
        codeBlocks?: {
            showLanguage?: boolean;
            showLineNumbers?: boolean;
            backgroundColor?: string;
            borderColor?: string;
            borderWidth?: string;
        };
        tables?: {
            preventPageBreak: boolean;
            equalWidthColumns?: boolean;
            alignment?: 'left' | 'center' | 'right';
            maxWidth?: number; // Maximum table width as percentage (default: 100)
            headerStyle?: {
                bold?: boolean;
                italic?: boolean;
                underline?: boolean;
                backgroundColor?: string;
                textColor?: string;
                textAlign?: 'left' | 'center' | 'right';
            };
            cellStyle?: {
                bold?: boolean;
                italic?: boolean;
                underline?: boolean;
                backgroundColor?: string;
                textColor?: string;
                textAlign?: 'left' | 'center' | 'right';
            };
            border?: {
                width?: string;
                color?: string;
            };
        };
        outline?: {
            enabled: boolean;
            title?: {
                content: string;
            };
            entries?: {
                fontSize: string;
                bold: boolean;
                italic: boolean;
                underline: boolean;
                filler: 'dotted' | 'line' | 'empty';
            };
            emptyPagesAfter?: number;
        };
        figures?: {
            captionEnabled: boolean;
            captionFormat: string; // e.g., "Figure #: {Caption}"
            defaultWidth?: string; // e.g., "100%", "400px"
            defaultHeight?: string; // e.g., "auto", "300px"
            margins?: {
                top: string;
                bottom: string;
                left: string;
                right: string;
            };
            alignment?: 'left' | 'center' | 'right';
        };
        alerts?: {
            showHeader: boolean;
            note?: {
                icon?: string;
                text?: string;
                labelColor?: string;
                backgroundColor?: string;
                textColor?: string;
            };
            tip?: {
                icon?: string;
                text?: string;
                labelColor?: string;
                backgroundColor?: string;
                textColor?: string;
            };
            important?: {
                icon?: string;
                text?: string;
                labelColor?: string;
                backgroundColor?: string;
                textColor?: string;
            };
            warning?: {
                icon?: string;
                text?: string;
                labelColor?: string;
                backgroundColor?: string;
                textColor?: string;
            };
            caution?: {
                icon?: string;
                text?: string;
                labelColor?: string;
                backgroundColor?: string;
                textColor?: string;
            };
        };
    }
}

// ==================== Storage Entry Types ====================

/**
 * File entry stored in IndexedDB (files store).
 * Extends SyncMetadata for cloud sync support.
 */
export interface FileEntry extends SyncMetadata {
    path: string;         // Relative path (also the IndexedDB key)
    content: string;      // File content
    type: 'file' | 'folder';
}

/**
 * Image entry stored in IndexedDB (images store).
 * Extends SyncMetadata for cloud sync support.
 */
export interface ImageEntry extends SyncMetadata {
    id: string;           // Unique ID for the image
    blob: Blob;           // The actual image data
    name: string;         // Original filename
    type: string;         // MIME type (e.g., 'image/png')
    size: number;         // File size in bytes
    createdAt: number;    // Timestamp when stored
}

/**
 * Font entry stored in IndexedDB (fonts store).
 * Extends SyncMetadata for cloud sync support.
 */
export interface FontEntry extends SyncMetadata {
    id: string;           // Unique ID (family name usually)
    family: string;       // Font family name
    blob: Blob;           // The actual font file data
    fileName: string;     // Original filename
    format: string;       // e.g., 'truetype', 'opentype', 'woff', 'woff2'
    createdAt: number;    // Timestamp when stored
}
