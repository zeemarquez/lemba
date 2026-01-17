import { NextResponse } from 'next/server';
import { ensureStorageInit } from '@/lib/server/storage';
import fs from 'fs/promises';
import path from 'path';

export async function POST(request: Request) {
    const body = await request.json();
    const { oldPath, newPath } = body;

    if (!oldPath || !newPath) {
        return NextResponse.json({ error: 'Old and new paths are required' }, { status: 400 });
    }

    try {
        const rootPath = await ensureStorageInit();
        const fullOldPath = path.resolve(rootPath, oldPath);
        const fullNewPath = path.resolve(rootPath, newPath);

        // Security check
        if (!fullOldPath.startsWith(path.resolve(rootPath)) || !fullNewPath.startsWith(path.resolve(rootPath))) {
            return NextResponse.json({ error: 'Invalid path' }, { status: 403 });
        }

        // Check if destination exists
        try {
            await fs.access(fullNewPath);
            return NextResponse.json({ error: 'Destination already exists' }, { status: 409 });
        } catch {
            // Destination doesn't exist, proceed
        }

        await fs.rename(fullOldPath, fullNewPath);
        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('Rename failed:', error);
        return NextResponse.json({ error: 'Failed to rename item' }, { status: 500 });
    }
}
