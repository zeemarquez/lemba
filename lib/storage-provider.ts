import { FileNode, Template } from './store';

export interface StorageProvider {
    // File System Operations
    list(dir?: string): Promise<{ tree: FileNode[], rootPath: string }>;
    readFile(path: string): Promise<string>;
    createFile(path: string, content?: string): Promise<void>;
    writeFile(path: string, content: string): Promise<void>; // Update existing
    createFolder(path: string): Promise<void>;
    delete(path: string, type: 'file' | 'folder'): Promise<void>;
    rename(oldPath: string, newPath: string): Promise<void>;
    move(sourcePath: string, destinationPath: string): Promise<void>;

    // Template Operations
    listTemplates(): Promise<Template[]>;
    createTemplate(path: string, template: Template): Promise<void>;
    saveTemplate(path: string, template: Template): Promise<void>;
    deleteTemplate(path: string): Promise<void>;
}
