import { NextResponse } from 'next/server';
import { ensureStorageInit } from '@/lib/server/storage';
import fs from 'fs/promises';
import path from 'path';

export async function POST(request: Request) {
    const body = await request.json();
    const { sourcePath, destinationPath } = body;

    if (!sourcePath || !destinationPath) {
        return NextResponse.json({ error: 'Source and destination paths are required' }, { status: 400 });
    }

    try {
        const rootPath = await ensureStorageInit();
        const fullSourcePath = path.resolve(rootPath, sourcePath);
        const fullDestinationPath = path.resolve(rootPath, destinationPath);

        // Security check
        if (!fullSourcePath.startsWith(path.resolve(rootPath)) || !fullDestinationPath.startsWith(path.resolve(rootPath))) {
            return NextResponse.json({ error: 'Invalid path' }, { status: 403 });
        }

        // Check if destination exists (if it's a folder, we might be moving INTO it, handled by frontend logic passing correct path)
        // But here we expect destinationPath to be the FULL new path including filename
        
        try {
            await fs.access(fullDestinationPath);
            return NextResponse.json({ error: 'Destination already exists' }, { status: 409 });
        } catch {
            // Destination doesn't exist, proceed
        }

        await fs.rename(fullSourcePath, fullDestinationPath);
        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('Move failed:', error);
        return NextResponse.json({ error: 'Failed to move item' }, { status: 500 });
    }
}
