import { FileNode, Template } from './store';
import { StorageProvider } from './storage-provider';

class ApiStorage implements StorageProvider {
    async list(dir: string = ''): Promise<{ tree: FileNode[], rootPath: string }> {
        const res = await fetch('/api/fs/list');
        if (!res.ok) throw new Error('Failed to fetch file tree');
        const data = await res.json();
        return { tree: data.tree, rootPath: data.rootPath };
    }

    async readFile(path: string): Promise<string> {
        const res = await fetch(`/api/fs/file?path=${encodeURIComponent(path)}`);
        if (!res.ok) throw new Error('Failed to fetch file content');
        const data = await res.json();
        return data.content;
    }

    async createFile(path: string, content: string = ''): Promise<void> {
        const res = await fetch('/api/fs/file', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ path, content })
        });
        if (!res.ok) throw new Error('Failed to create file');
    }

    async writeFile(path: string, content: string): Promise<void> {
        const res = await fetch('/api/fs/file', {
            method: 'PUT', 
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ path, content })
        });
        if (!res.ok) throw new Error('Failed to save file');
    }

    async createFolder(path: string): Promise<void> {
        const res = await fetch('/api/fs/folder', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ path })
        });
        if (!res.ok) throw new Error('Failed to create folder');
    }

    async delete(path: string, type: 'file' | 'folder'): Promise<void> {
        const endpoint = type === 'file' ? '/api/fs/file' : '/api/fs/folder';
        const res = await fetch(`${endpoint}?path=${encodeURIComponent(path)}`, {
            method: 'DELETE'
        });
        if (!res.ok) throw new Error('Failed to delete item');
    }

    async rename(oldPath: string, newPath: string): Promise<void> {
        const res = await fetch('/api/fs/rename', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ oldPath, newPath })
        });
        if (!res.ok) throw new Error('Failed to rename item');
    }

    async move(sourcePath: string, destinationPath: string): Promise<void> {
        const res = await fetch('/api/fs/move', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ sourcePath, destinationPath })
        });
        if (!res.ok) throw new Error('Failed to move item');
    }

    async listTemplates(): Promise<Template[]> {
        const res = await fetch('/api/templates/list');
        if (!res.ok) throw new Error('Failed to fetch templates');
        const data = await res.json();
        return data.templates || [];
    }

    async createTemplate(path: string, template: Template): Promise<void> {
        const res = await fetch('/api/templates', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ path, content: template })
        });
        if (!res.ok) throw new Error('Failed to create template');
    }

    async saveTemplate(path: string, template: Template): Promise<void> {
        const res = await fetch('/api/templates', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ path, content: template })
        });
        if (!res.ok) throw new Error('Failed to save template');
    }

    async deleteTemplate(path: string): Promise<void> {
        return this.delete(path, 'file');
    }
}

export const apiStorage = new ApiStorage();
