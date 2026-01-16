import { NextResponse } from 'next/server';
import { getConfig, ensureStorageInit } from '@/lib/server/storage';
import fs from 'fs/promises';
import path from 'path';

export async function POST(request: Request) {
    const body = await request.json();
    const { path: relPath } = body;

    if (!relPath) {
        return NextResponse.json({ error: 'Path is required' }, { status: 400 });
    }

    try {
        const rootPath = await ensureStorageInit();
        const resolvedRoot = path.resolve(rootPath);
        const resolvedFull = path.resolve(resolvedRoot, relPath);

        if (!resolvedFull.startsWith(resolvedRoot)) {
            return NextResponse.json({ error: 'Invalid path' }, { status: 403 });
        }
        
        const fullPath = resolvedFull;

        await fs.mkdir(fullPath, { recursive: true });
        return NextResponse.json({ success: true });
    } catch (error) {
        return NextResponse.json({ error: 'Failed to create folder' }, { status: 500 });
    }
}

export async function DELETE(request: Request) {
    const { searchParams } = new URL(request.url);
    const relPath = searchParams.get('path');

    if (!relPath) {
        return NextResponse.json({ error: 'Path is required' }, { status: 400 });
    }

    try {
        const rootPath = await ensureStorageInit();
        const resolvedRoot = path.resolve(rootPath);
        const resolvedFull = path.resolve(resolvedRoot, relPath);

        if (!resolvedFull.startsWith(resolvedRoot)) {
            return NextResponse.json({ error: 'Invalid path' }, { status: 403 });
        }
        
        const fullPath = resolvedFull;

        await fs.rm(fullPath, { recursive: true, force: true });
        return NextResponse.json({ success: true });
    } catch (error) {
        return NextResponse.json({ error: 'Failed to delete folder' }, { status: 500 });
    }
}
