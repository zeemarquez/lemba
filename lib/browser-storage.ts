import { FileNode, Template } from './store';

const DB_NAME = 'markdown-editor-db';
const DB_VERSION = 2;
const STORE_FILES = 'files';
const STORE_TEMPLATES = 'templates';

interface FileEntry {
    path: string;
    content: string;
    type: 'file' | 'folder';
    updatedAt: number;
}

class BrowserStorage {
    private db: IDBDatabase | null = null;

    private async initDB(): Promise<IDBDatabase> {
        if (this.db) return this.db;

        return new Promise((resolve, reject) => {
            const request = indexedDB.open(DB_NAME, DB_VERSION);

            request.onerror = () => reject(request.error);
            request.onsuccess = () => {
                this.db = request.result;
                resolve(request.result);
            };

            request.onupgradeneeded = (event) => {
                const db = (event.target as IDBOpenDBRequest).result;
                const tx = (event.target as IDBOpenDBRequest).transaction;
                
                let filesStore: IDBObjectStore;
                if (!db.objectStoreNames.contains(STORE_FILES)) {
                    filesStore = db.createObjectStore(STORE_FILES, { keyPath: 'path' });
                } else {
                    filesStore = tx!.objectStore(STORE_FILES);
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
                                        updatedAt: Date.now()
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
                const files = request.result as FileEntry[];
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

    async createFile(path: string, content: string = ''): Promise<void> {
        // Check if exists
        try {
            await this.readFile(path);
            throw new Error('File already exists');
        } catch (e: any) {
            if (e.message !== 'File not found') throw e;
        }

        await this.transaction(STORE_FILES, 'readwrite', store => {
            store.put({
                path,
                content,
                type: 'file',
                updatedAt: Date.now()
            });
        });
        await this.ensureParentFolders(path);
    }

    async writeFile(path: string, content: string): Promise<void> {
        await this.transaction(STORE_FILES, 'readwrite', store => {
            store.put({
                path,
                content,
                type: 'file',
                updatedAt: Date.now()
            });
        });
        await this.ensureParentFolders(path);
    }

    async createFolder(path: string): Promise<void> {
        await this.transaction(STORE_FILES, 'readwrite', store => {
            store.put({
                path,
                content: '',
                type: 'folder',
                updatedAt: Date.now()
            });
        });
        await this.ensureParentFolders(path);
    }

    private async ensureParentFolders(path: string) {
        const parts = path.split('/');
        if (parts.length <= 1) return;

        const parentPath = parts.slice(0, -1).join('/');
        const db = await this.initDB();
        
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
                        updatedAt: Date.now()
                    });
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

    async createTemplate(path: string, template: Template): Promise<void> {
         await this.createFile(path, JSON.stringify(template, null, 2));
    }

    async deleteTemplate(path: string): Promise<void> {
        await this.delete(path, 'file');
    }
}

export const browserStorage = new BrowserStorage();
