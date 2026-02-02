import { FileNode, Template, ImageEntry, FontEntry, FileEntry, RagDocument, generateSyncId } from './types';
import { compressImage } from './image-compression';

const DB_NAME = 'markdown-editor-db';
const DB_VERSION = 13; // Bumped for RAG documents
const STORE_FILES = 'files';
const STORE_TEMPLATES = 'templates';
const STORE_IMAGES = 'images';
const STORE_FONTS = 'fonts';
const STORE_RAG = 'rag_documents';



class BrowserStorage {
    private db: IDBDatabase | null = null;
    private initPromise: Promise<IDBDatabase> | null = null;

    private async initDB(): Promise<IDBDatabase> {
        if (this.db) return this.db;
        if (this.initPromise) return this.initPromise;

        this.initPromise = new Promise((resolve, reject) => {
            const request = indexedDB.open(DB_NAME, DB_VERSION);

            request.onerror = () => {
                this.initPromise = null;
                reject(request.error);
            };

            request.onblocked = () => {
                console.warn('Database upgrade blocked. Please close other tabs.');
            };

            request.onsuccess = () => {
                this.db = request.result;

                this.db.onversionchange = () => {
                    this.db?.close();
                    this.db = null;
                    this.initPromise = null;
                };

                resolve(request.result);
            };

            request.onupgradeneeded = (event) => {
                const db = (event.target as IDBOpenDBRequest).result;
                const tx = (event.target as IDBOpenDBRequest).transaction;
                const oldVersion = event.oldVersion;

                let filesStore: IDBObjectStore;
                if (!db.objectStoreNames.contains(STORE_FILES)) {
                    filesStore = db.createObjectStore(STORE_FILES, { keyPath: 'path' });
                } else {
                    filesStore = tx!.objectStore(STORE_FILES);
                }

                let imagesStore: IDBObjectStore;
                // Create images store for persistent image storage
                if (!db.objectStoreNames.contains(STORE_IMAGES)) {
                    imagesStore = db.createObjectStore(STORE_IMAGES, { keyPath: 'id' });
                } else {
                    imagesStore = tx!.objectStore(STORE_IMAGES);
                }

                let fontsStore: IDBObjectStore;
                // Create fonts store for persistent font storage
                if (!db.objectStoreNames.contains(STORE_FONTS)) {
                    fontsStore = db.createObjectStore(STORE_FONTS, { keyPath: 'id' });
                } else {
                    fontsStore = tx!.objectStore(STORE_FONTS);
                }

                // Add indexes for sync functionality (v12+)
                if (oldVersion < 12) {
                    // Add indexes on files store
                    if (!filesStore.indexNames.contains('updatedAt')) {
                        filesStore.createIndex('updatedAt', 'updatedAt', { unique: false });
                    }
                    if (!filesStore.indexNames.contains('syncId')) {
                        filesStore.createIndex('syncId', 'syncId', { unique: false });
                    }

                    // Add indexes on images store
                    if (!imagesStore.indexNames.contains('updatedAt')) {
                        imagesStore.createIndex('updatedAt', 'updatedAt', { unique: false });
                    }
                    if (!imagesStore.indexNames.contains('syncId')) {
                        imagesStore.createIndex('syncId', 'syncId', { unique: false });
                    }

                    // Add indexes on fonts store
                    if (!fontsStore.indexNames.contains('updatedAt')) {
                        fontsStore.createIndex('updatedAt', 'updatedAt', { unique: false });
                    }
                    if (!fontsStore.indexNames.contains('syncId')) {
                        fontsStore.createIndex('syncId', 'syncId', { unique: false });
                    }

                    // Migrate existing files to add sync metadata
                    const filesRequest = filesStore.getAll();
                    filesRequest.onsuccess = () => {
                        const files = filesRequest.result;
                        files.forEach((file: any) => {
                            if (!file.syncId) {
                                filesStore.put({
                                    ...file,
                                    syncId: generateSyncId(),
                                    updatedAt: file.updatedAt || Date.now(),
                                    isDeleted: false,
                                    userId: null
                                });
                            }
                        });
                    };

                    // Migrate existing images to add sync metadata
                    const imagesRequest = imagesStore.getAll();
                    imagesRequest.onsuccess = () => {
                        const images = imagesRequest.result;
                        images.forEach((image: any) => {
                            if (!image.syncId) {
                                imagesStore.put({
                                    ...image,
                                    syncId: generateSyncId(),
                                    updatedAt: image.createdAt || Date.now(),
                                    isDeleted: false,
                                    userId: null
                                });
                            }
                        });
                    };

                    // Migrate existing fonts to add sync metadata
                    const fontsRequest = fontsStore.getAll();
                    fontsRequest.onsuccess = () => {
                        const fonts = fontsRequest.result;
                        fonts.forEach((font: any) => {
                            if (!font.syncId) {
                                fontsStore.put({
                                    ...font,
                                    syncId: generateSyncId(),
                                    updatedAt: font.createdAt || Date.now(),
                                    isDeleted: false,
                                    userId: null
                                });
                            }
                        });
                    };
                }

                // Add RAG documents store (v13+)
                if (oldVersion < 13) {
                    if (!db.objectStoreNames.contains(STORE_RAG)) {
                        const ragStore = db.createObjectStore(STORE_RAG, { keyPath: 'id' });
                        ragStore.createIndex('chatId', 'chatId', { unique: false });
                        ragStore.createIndex('updatedAt', 'updatedAt', { unique: false });
                        ragStore.createIndex('syncId', 'syncId', { unique: false });
                    }
                }

                if (!db.objectStoreNames.contains(STORE_TEMPLATES)) {
                    // No need to create it if it doesn't exist, we are deprecating it
                    // But if we are in v1->v2 upgrade, it might exist
                } else {
                    // Migrate templates to files
                    const templatesStore = tx!.objectStore(STORE_TEMPLATES);
                    const request = templatesStore.getAll();
                    request.onsuccess = () => {
                        const templates = request.result as Template[];
                        templates.forEach(template => {
                            const path = template.id; // id was the path
                            // Check if file exists to avoid overwrite? 
                            // Or overwrite to ensure template is saved as file?
                            // Safest is to save if not exists.
                            const fileReq = filesStore.get(path);
                            fileReq.onsuccess = () => {
                                if (!fileReq.result) {
                                    filesStore.put({
                                        path: path,
                                        content: JSON.stringify(template, null, 2),
                                        type: 'file',
                                        updatedAt: Date.now(),
                                        syncId: generateSyncId(),
                                        isDeleted: false,
                                        userId: null
                                    });
                                }
                            };
                        });
                        // We can optionally delete the store, but safer to keep for now
                        // db.deleteObjectStore(STORE_TEMPLATES); 
                    };
                }
            };
        });

        return this.initPromise;
    }

    private async transaction<T>(
        storeName: string,
        mode: IDBTransactionMode,
        callback: (store: IDBObjectStore) => IDBRequest<T> | void
    ): Promise<T> {
        const db = await this.initDB();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(storeName, mode);
            const store = tx.objectStore(storeName);

            let request: IDBRequest<T> | void;
            try {
                request = callback(store);
            } catch (e) {
                reject(e);
                return;
            }

            tx.oncomplete = () => {
                if (request) {
                    resolve(request.result);
                } else {
                    resolve(undefined as T);
                }
            };

            tx.onerror = () => reject(tx.error);
        });
    }

    async list(dir: string = ''): Promise<{ tree: FileNode[], rootPath: string }> {
        const db = await this.initDB();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(STORE_FILES, 'readonly');
            const store = tx.objectStore(STORE_FILES);
            const request = store.getAll();

            request.onsuccess = () => {
                const allFiles = request.result as FileEntry[];
                // Filter out soft-deleted files
                const files = allFiles.filter(f => !f.isDeleted);
                const tree = this.buildTree(files);
                resolve({ tree, rootPath: '/' });
            };
            request.onerror = () => reject(request.error);
        });
    }

    private buildTree(files: FileEntry[]): FileNode[] {
        const root: FileNode[] = [];
        const map = new Map<string, FileNode>();

        files.forEach(file => {
            map.set(file.path, {
                id: file.path,
                name: file.path.split('/').pop() || file.path,
                type: file.type,
                children: file.type === 'folder' ? [] : undefined
            });
        });

        files.forEach(file => {
            const node = map.get(file.path)!;
            const parts = file.path.split('/');
            if (parts.length === 1) {
                root.push(node);
            } else {
                const parentPath = parts.slice(0, -1).join('/');
                const parent = map.get(parentPath);
                if (parent && parent.children) {
                    parent.children.push(node);
                } else {
                    root.push(node);
                }
            }
        });

        const sortNodes = (nodes: FileNode[]) => {
            nodes.sort((a, b) => {
                if (a.type === b.type) return a.name.localeCompare(b.name);
                return a.type === 'folder' ? -1 : 1;
            });
            nodes.forEach(node => {
                if (node.children) sortNodes(node.children);
            });
        };
        sortNodes(root);

        return root;
    }

    async readFile(path: string): Promise<string> {
        const entry = await this.transaction<FileEntry>(STORE_FILES, 'readonly', store => store.get(path));
        if (!entry) throw new Error('File not found');
        return entry.content;
    }

    async createFile(path: string, content: string = '', overwrite: boolean = false): Promise<FileEntry> {
        // Check if exists
        try {
            await this.readFile(path);
            if (!overwrite) {
                throw new Error('File already exists');
            }
        } catch (e: any) {
            if (e.message !== 'File not found' && e.message !== 'File already exists') throw e;
        }

        const fileEntry: FileEntry = {
            path,
            content,
            type: 'file',
            updatedAt: Date.now(),
            syncId: generateSyncId(),
            isDeleted: false,
            userId: null
        };
        await this.transaction(STORE_FILES, 'readwrite', store => {
            store.put(fileEntry);
        });
        await this.ensureParentFolders(path);
        return fileEntry;
    }

    async writeFile(path: string, content: string): Promise<FileEntry> {
        // First, try to get existing entry to preserve syncId
        let existingEntry: FileEntry | null = null;
        try {
            existingEntry = await this.transaction<FileEntry>(STORE_FILES, 'readonly', store => store.get(path));
        } catch (e) {
            // File doesn't exist, that's okay
        }

        const fileEntry: FileEntry = {
            path,
            content,
            type: 'file',
            updatedAt: Date.now(),
            syncId: existingEntry?.syncId || generateSyncId(),
            isDeleted: false,
            userId: existingEntry?.userId || null
        };
        await this.transaction(STORE_FILES, 'readwrite', store => {
            store.put(fileEntry);
        });
        await this.ensureParentFolders(path);
        return fileEntry;
    }

    async createFolder(path: string): Promise<FileEntry> {
        const folderEntry: FileEntry = {
            path,
            content: '',
            type: 'folder',
            updatedAt: Date.now(),
            syncId: generateSyncId(),
            isDeleted: false,
            userId: null
        };
        await this.transaction(STORE_FILES, 'readwrite', store => {
            store.put(folderEntry);
        });
        await this.ensureParentFolders(path);
        return folderEntry;
    }

    private async ensureParentFolders(path: string) {
        const parts = path.split('/');
        if (parts.length <= 1) return;

        const parentPath = parts.slice(0, -1).join('/');

        // This should probably be optimized to not open transaction recursively
        // but for now it's okay for depth < 10
        try {
            const exists = await this.transaction(STORE_FILES, 'readonly', store => store.get(parentPath));
            if (!exists) {
                await this.transaction(STORE_FILES, 'readwrite', store => {
                    store.put({
                        path: parentPath,
                        content: '',
                        type: 'folder',
                        updatedAt: Date.now(),
                        syncId: generateSyncId(),
                        isDeleted: false,
                        userId: null
                    } as FileEntry);
                });
                await this.ensureParentFolders(parentPath);
            }
        } catch (e) {
            // Ignore error
        }
    }

    async delete(path: string, type: 'file' | 'folder'): Promise<void> {
        await this.transaction(STORE_FILES, 'readwrite', store => {
            if (type === 'folder') {
                // We need to query first to find children
                // This is tricky inside a callback if we need results to delete
                // Better to do it in two steps or use cursor
                // For now, let's just delete the exact key and hope caller handles children?
                // No, recursive delete is expected.
                // We can use a cursor to find all matching prefixes
            }
            // For simplicity in this turn, I will implement simple delete
            // and let the user re-delete children or refine later.
            store.delete(path);
        });

        // Proper folder delete implementation
        if (type === 'folder') {
            const db = await this.initDB();
            const tx = db.transaction(STORE_FILES, 'readwrite');
            const store = tx.objectStore(STORE_FILES);
            const request = store.getAllKeys();
            request.onsuccess = () => {
                const keys = request.result as string[];
                keys.forEach(key => {
                    if (key.startsWith(path + '/')) {
                        store.delete(key);
                    }
                });
            };
        }
    }

    async rename(oldPath: string, newPath: string): Promise<void> {
        const db = await this.initDB();
        const tx = db.transaction(STORE_FILES, 'readwrite');
        const store = tx.objectStore(STORE_FILES);

        const request = store.getAll();

        return new Promise((resolve, reject) => {
            request.onsuccess = () => {
                const files = request.result as FileEntry[];
                files.forEach(file => {
                    if (file.path === oldPath || file.path.startsWith(oldPath + '/')) {
                        const newFilePath = file.path.replace(oldPath, newPath);
                        store.delete(file.path);
                        store.put({ ...file, path: newFilePath });
                    }
                });
                resolve();
            };
            request.onerror = () => reject(request.error);
        });
    }

    async move(sourcePath: string, destinationPath: string): Promise<void> {
        return this.rename(sourcePath, destinationPath);
    }

    async listTemplates(): Promise<Template[]> {
        const files = await this.transaction<FileEntry[]>(STORE_FILES, 'readonly', store => store.getAll());
        const templates: Template[] = [];

        for (const file of files) {
            // Skip soft-deleted files
            if (file.isDeleted) continue;

            if (file.path.startsWith('Templates/') && (file.path.endsWith('.mdt') || file.path.endsWith('.json'))) {
                try {
                    const template = JSON.parse(file.content);
                    template.id = file.path;
                    templates.push(template);
                } catch (e) {
                    console.error('Failed to parse template', file.path);
                }
            }
        }
        return templates;
    }

    async saveTemplate(path: string, template: Template): Promise<void> {
        await this.writeFile(path, JSON.stringify(template, null, 2));
    }

    async createTemplate(path: string, template: Template, overwrite: boolean = false): Promise<void> {
        await this.createFile(path, JSON.stringify(template, null, 2), overwrite);
    }

    async deleteTemplate(path: string): Promise<void> {
        await this.delete(path, 'file');
    }

    // ==================== Image Storage Methods ====================

    /**
     * Generate a unique ID for an image
     */
    generateImageId(): string {
        return `img-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
    }

    /**
     * Store an image in IndexedDB
     * @param file The image file to store (will be compressed if over 500KB)
     * @returns The stored image entry with its ID
     */
    async storeImage(file: File): Promise<ImageEntry> {
        console.log(`[BrowserStorage] storeImage called for: ${file.name}, size: ${(file.size / 1024 / 1024).toFixed(2)}MB`);

        // Try to compress image if it's over 500KB
        // If compression fails, use original file
        let fileToStore: File;
        try {
            console.log(`[BrowserStorage] Starting compression...`);
            const compressionStart = Date.now();
            fileToStore = await compressImage(file, 500 * 1024);
            const compressionTime = Date.now() - compressionStart;
            console.log(`[BrowserStorage] Compression completed in ${compressionTime}ms, final size: ${(fileToStore.size / 1024 / 1024).toFixed(2)}MB`);
        } catch (compressionError) {
            console.warn('[BrowserStorage] Image compression failed, storing original file:', compressionError);
            fileToStore = file;
        }

        const id = this.generateImageId();
        const now = Date.now();
        const entry: ImageEntry = {
            id,
            blob: fileToStore,
            name: fileToStore.name,
            type: fileToStore.type,
            size: fileToStore.size,
            createdAt: now,
            // Sync metadata
            syncId: generateSyncId(),
            updatedAt: now,
            isDeleted: false,
            userId: null
        };

        console.log(`[BrowserStorage] Storing image entry with ID: ${id}`);
        try {
            await this.transaction(STORE_IMAGES, 'readwrite', store => {
                store.put(entry);
            });
            console.log(`[BrowserStorage] Image stored successfully in IndexedDB`);
        } catch (storageError) {
            console.error('[BrowserStorage] Failed to store in IndexedDB:', storageError);
            throw storageError;
        }

        return entry;
    }

    /**
     * Retrieve an image from IndexedDB by ID
     * @param id The image ID
     * @returns The image entry or null if not found
     */
    async getImage(id: string): Promise<ImageEntry | null> {
        try {
            const entry = await this.transaction<ImageEntry>(STORE_IMAGES, 'readonly', store => store.get(id));
            return entry || null;
        } catch (e) {
            console.error('Error retrieving image:', e);
            return null;
        }
    }

    /**
     * Get a blob URL for an image stored in IndexedDB
     * @param id The image ID
     * @returns A blob URL that can be used in img src, or null if not found
     */
    async getImageUrl(id: string): Promise<string | null> {
        const entry = await this.getImage(id);
        if (!entry) return null;
        return URL.createObjectURL(entry.blob);
    }

    /**
     * Delete an image from IndexedDB
     * @param id The image ID
     */
    async deleteImage(id: string): Promise<void> {
        await this.transaction(STORE_IMAGES, 'readwrite', store => {
            store.delete(id);
        });
    }

    /**
     * List all stored images
     * @returns Array of image entries (without blob data for efficiency)
     */
    async listImages(): Promise<Omit<ImageEntry, 'blob'>[]> {
        const db = await this.initDB();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(STORE_IMAGES, 'readonly');
            const store = tx.objectStore(STORE_IMAGES);
            const request = store.getAll();

            request.onsuccess = () => {
                const entries = request.result as ImageEntry[];
                // Return entries without blob for efficiency when just listing
                resolve(entries.map(({ blob, ...rest }) => rest));
            };
            request.onerror = () => reject(request.error);
        });
    }

    // ==================== Font Storage Methods ====================

    /**
     * Store a font in IndexedDB
     */
    async storeFont(family: string, file: File): Promise<FontEntry> {
        // Determine format from mime type or extension
        let format = 'truetype';
        if (file.name.endsWith('.woff2')) format = 'woff2';
        else if (file.name.endsWith('.woff')) format = 'woff';
        else if (file.name.endsWith('.otf')) format = 'opentype';

        const id = family.toLowerCase().replace(/\s+/g, '-');
        const now = Date.now();
        const entry: FontEntry = {
            id,
            family,
            blob: file,
            fileName: file.name,
            format,
            createdAt: now,
            // Sync metadata
            syncId: generateSyncId(),
            updatedAt: now,
            isDeleted: false,
            userId: null
        };

        await this.transaction(STORE_FONTS, 'readwrite', store => {
            store.put(entry);
        });

        return entry;
    }

    /**
     * Save a complete font entry (used for preloaded or synced fonts)
     */
    async saveFont(font: FontEntry): Promise<void> {
        await this.transaction(STORE_FONTS, 'readwrite', store => {
            store.put(font);
        });
    }

    /**
     * Retrieve all fonts from IndexedDB
     */
    async listFonts(): Promise<FontEntry[]> {
        const db = await this.initDB();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(STORE_FONTS, 'readonly');
            const store = tx.objectStore(STORE_FONTS);
            const request = store.getAll();

            request.onsuccess = () => {
                resolve(request.result as FontEntry[]);
            };
            request.onerror = () => reject(request.error);
        });
    }

    /**
     * Delete a font from IndexedDB
     */
    async deleteFont(id: string): Promise<void> {
        await this.transaction(STORE_FONTS, 'readwrite', store => {
            store.delete(id);
        });
    }

    // ==================== Sync Helper Methods ====================

    /**
     * Get all files updated since a given timestamp
     */
    async getFilesUpdatedSince(timestamp: number): Promise<FileEntry[]> {
        const db = await this.initDB();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(STORE_FILES, 'readonly');
            const store = tx.objectStore(STORE_FILES);
            const index = store.index('updatedAt');
            const range = IDBKeyRange.lowerBound(timestamp, true);
            const request = index.getAll(range);

            request.onsuccess = () => {
                resolve(request.result as FileEntry[]);
            };
            request.onerror = () => reject(request.error);
        });
    }

    /**
     * Get all images updated since a given timestamp
     */
    async getImagesUpdatedSince(timestamp: number): Promise<ImageEntry[]> {
        const db = await this.initDB();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(STORE_IMAGES, 'readonly');
            const store = tx.objectStore(STORE_IMAGES);
            const index = store.index('updatedAt');
            const range = IDBKeyRange.lowerBound(timestamp, true);
            const request = index.getAll(range);

            request.onsuccess = () => {
                resolve(request.result as ImageEntry[]);
            };
            request.onerror = () => reject(request.error);
        });
    }

    /**
     * Get all fonts updated since a given timestamp
     */
    async getFontsUpdatedSince(timestamp: number): Promise<FontEntry[]> {
        const db = await this.initDB();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(STORE_FONTS, 'readonly');
            const store = tx.objectStore(STORE_FONTS);
            const index = store.index('updatedAt');
            const range = IDBKeyRange.lowerBound(timestamp, true);
            const request = index.getAll(range);

            request.onsuccess = () => {
                resolve(request.result as FontEntry[]);
            };
            request.onerror = () => reject(request.error);
        });
    }

    /**
     * Get a file entry by its syncId
     */
    async getFileBySyncId(syncId: string): Promise<FileEntry | null> {
        const db = await this.initDB();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(STORE_FILES, 'readonly');
            const store = tx.objectStore(STORE_FILES);
            const index = store.index('syncId');
            const request = index.get(syncId);

            request.onsuccess = () => {
                resolve(request.result || null);
            };
            request.onerror = () => reject(request.error);
        });
    }

    /**
     * Get an image entry by its syncId
     */
    async getImageBySyncId(syncId: string): Promise<ImageEntry | null> {
        const db = await this.initDB();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(STORE_IMAGES, 'readonly');
            const store = tx.objectStore(STORE_IMAGES);
            const index = store.index('syncId');
            const request = index.get(syncId);

            request.onsuccess = () => {
                resolve(request.result || null);
            };
            request.onerror = () => reject(request.error);
        });
    }

    /**
     * Get a font entry by its syncId
     */
    async getFontBySyncId(syncId: string): Promise<FontEntry | null> {
        const db = await this.initDB();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(STORE_FONTS, 'readonly');
            const store = tx.objectStore(STORE_FONTS);
            const index = store.index('syncId');
            const request = index.get(syncId);

            request.onsuccess = () => {
                resolve(request.result || null);
            };
            request.onerror = () => reject(request.error);
        });
    }

    /**
     * Get all files (including soft-deleted ones for sync purposes)
     */
    async getAllFiles(): Promise<FileEntry[]> {
        const db = await this.initDB();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(STORE_FILES, 'readonly');
            const store = tx.objectStore(STORE_FILES);
            const request = store.getAll();

            request.onsuccess = () => {
                resolve(request.result as FileEntry[]);
            };
            request.onerror = () => reject(request.error);
        });
    }

    /**
     * Get all images (including soft-deleted ones for sync purposes)
     */
    async getAllImages(): Promise<ImageEntry[]> {
        const db = await this.initDB();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(STORE_IMAGES, 'readonly');
            const store = tx.objectStore(STORE_IMAGES);
            const request = store.getAll();

            request.onsuccess = () => {
                resolve(request.result as ImageEntry[]);
            };
            request.onerror = () => reject(request.error);
        });
    }

    /**
     * Get all fonts (including soft-deleted ones for sync purposes)
     */
    async getAllFonts(): Promise<FontEntry[]> {
        const db = await this.initDB();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(STORE_FONTS, 'readonly');
            const store = tx.objectStore(STORE_FONTS);
            const request = store.getAll();

            request.onsuccess = () => {
                resolve(request.result as FontEntry[]);
            };
            request.onerror = () => reject(request.error);
        });
    }

    /**
     * Soft delete a file (set isDeleted flag)
     */
    async softDeleteFile(path: string): Promise<FileEntry | null> {
        const entry = await this.transaction<FileEntry>(STORE_FILES, 'readonly', store => store.get(path));
        if (!entry) return null;

        const updatedEntry: FileEntry = {
            ...entry,
            isDeleted: true,
            updatedAt: Date.now()
        };

        await this.transaction(STORE_FILES, 'readwrite', store => {
            store.put(updatedEntry);
        });

        return updatedEntry;
    }

    /**
     * Soft delete an image (set isDeleted flag)
     */
    async softDeleteImage(id: string): Promise<ImageEntry | null> {
        const entry = await this.transaction<ImageEntry>(STORE_IMAGES, 'readonly', store => store.get(id));
        if (!entry) return null;

        const updatedEntry: ImageEntry = {
            ...entry,
            isDeleted: true,
            updatedAt: Date.now()
        };

        await this.transaction(STORE_IMAGES, 'readwrite', store => {
            store.put(updatedEntry);
        });

        return updatedEntry;
    }

    /**
     * Soft delete a font (set isDeleted flag)
     */
    async softDeleteFont(id: string): Promise<FontEntry | null> {
        const entry = await this.transaction<FontEntry>(STORE_FONTS, 'readonly', store => store.get(id));
        if (!entry) return null;

        const updatedEntry: FontEntry = {
            ...entry,
            isDeleted: true,
            updatedAt: Date.now()
        };

        await this.transaction(STORE_FONTS, 'readwrite', store => {
            store.put(updatedEntry);
        });

        return updatedEntry;
    }

    /**
     * Upsert a file entry (for sync hydration)
     * Uses Last-Write-Wins based on updatedAt timestamp
     */
    async upsertFile(entry: FileEntry): Promise<void> {
        const existing = await this.transaction<FileEntry>(STORE_FILES, 'readonly', store => store.get(entry.path));

        // If existing entry has newer timestamp, skip
        if (existing && existing.updatedAt >= entry.updatedAt) {
            return;
        }

        await this.transaction(STORE_FILES, 'readwrite', store => {
            store.put(entry);
        });
    }

    /**
     * Upsert an image entry (for sync hydration)
     * Uses Last-Write-Wins based on updatedAt timestamp
     */
    async upsertImage(entry: ImageEntry): Promise<void> {
        const existing = await this.transaction<ImageEntry>(STORE_IMAGES, 'readonly', store => store.get(entry.id));

        // If existing entry has newer timestamp, skip
        if (existing && existing.updatedAt >= entry.updatedAt) {
            return;
        }

        await this.transaction(STORE_IMAGES, 'readwrite', store => {
            store.put(entry);
        });
    }

    /**
     * Upsert a font entry (for sync hydration)
     * Uses Last-Write-Wins based on updatedAt timestamp
     */
    async upsertFont(entry: FontEntry): Promise<void> {
        const existing = await this.transaction<FontEntry>(STORE_FONTS, 'readonly', store => store.get(entry.id));

        // If existing entry has newer timestamp, skip
        if (existing && existing.updatedAt >= entry.updatedAt) {
            return;
        }

        await this.transaction(STORE_FONTS, 'readwrite', store => {
            store.put(entry);
        });
    }

    /**
     * Update the userId for all local entries (called after login)
     */
    async setUserIdForAllEntries(userId: string): Promise<void> {
        const db = await this.initDB();

        // Update files
        const filesTx = db.transaction(STORE_FILES, 'readwrite');
        const filesStore = filesTx.objectStore(STORE_FILES);
        const filesRequest = filesStore.getAll();

        await new Promise<void>((resolve, reject) => {
            filesRequest.onsuccess = () => {
                const files = filesRequest.result as FileEntry[];
                files.forEach(file => {
                    if (!file.userId) {
                        filesStore.put({ ...file, userId });
                    }
                });
            };
            filesTx.oncomplete = () => resolve();
            filesTx.onerror = () => reject(filesTx.error);
        });

        // Update images
        const imagesTx = db.transaction(STORE_IMAGES, 'readwrite');
        const imagesStore = imagesTx.objectStore(STORE_IMAGES);
        const imagesRequest = imagesStore.getAll();

        await new Promise<void>((resolve, reject) => {
            imagesRequest.onsuccess = () => {
                const images = imagesRequest.result as ImageEntry[];
                images.forEach(image => {
                    if (!image.userId) {
                        imagesStore.put({ ...image, userId });
                    }
                });
            };
            imagesTx.oncomplete = () => resolve();
            imagesTx.onerror = () => reject(imagesTx.error);
        });

        // Update fonts
        const fontsTx = db.transaction(STORE_FONTS, 'readwrite');
        const fontsStore = fontsTx.objectStore(STORE_FONTS);
        const fontsRequest = fontsStore.getAll();

        await new Promise<void>((resolve, reject) => {
            fontsRequest.onsuccess = () => {
                const fonts = fontsRequest.result as FontEntry[];
                fonts.forEach(font => {
                    if (!font.userId) {
                        fontsStore.put({ ...font, userId });
                    }
                });
            };
            fontsTx.oncomplete = () => resolve();
            fontsTx.onerror = () => reject(fontsTx.error);
        });
    }

    /**
     * Get a raw file entry by path
     */
    async getFileEntry(path: string): Promise<FileEntry | null> {
        try {
            const entry = await this.transaction<FileEntry>(STORE_FILES, 'readonly', store => store.get(path));
            return entry || null;
        } catch (e) {
            return null;
        }
    }

    // ==================== RAG Document Methods ====================

    async storeRagDocument(doc: RagDocument): Promise<void> {
        await this.transaction(STORE_RAG, 'readwrite', store => {
            store.put(doc);
        });
    }

    async getRagDocumentsByChatId(chatId: string): Promise<RagDocument[]> {
        const db = await this.initDB();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(STORE_RAG, 'readonly');
            const store = tx.objectStore(STORE_RAG);
            const index = store.index('chatId');
            const request = index.getAll(chatId);

            request.onsuccess = () => {
                resolve(request.result as RagDocument[]);
            };
            request.onerror = () => reject(request.error);
        });
    }

    async deleteRagDocument(id: string): Promise<void> {
        await this.transaction(STORE_RAG, 'readwrite', store => {
            store.delete(id);
        });
    }

    async deleteRagDocumentsByChatId(chatId: string): Promise<void> {
        const docs = await this.getRagDocumentsByChatId(chatId);
        if (docs.length === 0) return;

        await this.transaction(STORE_RAG, 'readwrite', store => {
            docs.forEach(doc => {
                store.delete(doc.id);
            });
        });
    }
}

export const browserStorage = new BrowserStorage();
