import { NextResponse } from 'next/server';
import { getConfig, ensureStorageInit } from '@/lib/server/storage';
import fs from 'fs/promises';
import path from 'path';

interface FileNode {
    id: string;
    name: string;
    type: 'file' | 'folder';
    children?: FileNode[];
}

async function readDirectory(dir: string, rootPath: string): Promise<FileNode[]> {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    const nodes: FileNode[] = [];

    for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        const relativePath = path.relative(rootPath, fullPath).replace(/\\/g, '/');

        if (entry.isDirectory()) {
            nodes.push({
                id: relativePath,
                name: entry.name,
                type: 'folder',
                children: await readDirectory(fullPath, rootPath)
            });
        } else if (entry.isFile()) {
            nodes.push({
                id: relativePath,
                name: entry.name,
                type: 'file'
            });
        }
    }

    // Sort folders first, then files
    return nodes.sort((a, b) => {
        if (a.type === b.type) return a.name.localeCompare(b.name);
        return a.type === 'folder' ? -1 : 1;
    });
}

export async function GET() {
    try {
        const rootPath = await ensureStorageInit();
        const tree = await readDirectory(rootPath, rootPath);
        return NextResponse.json({ tree, rootPath });
    } catch (error) {
        return NextResponse.json({ error: 'Failed to list files' }, { status: 500 });
    }
}
