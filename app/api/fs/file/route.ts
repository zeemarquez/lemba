import { NextResponse } from 'next/server';
import { getConfig, ensureStorageInit } from '@/lib/server/storage';
import fs from 'fs/promises';
import path from 'path';

export async function GET(request: Request) {
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

        const content = await fs.readFile(fullPath, 'utf-8');
        return NextResponse.json({ content });
    } catch (error) {
        return NextResponse.json({ error: 'File not found' }, { status: 404 });
    }
}

export async function POST(request: Request) {
    const body = await request.json();
    const { path: relPath, content = '' } = body;

    if (!relPath) {
        return NextResponse.json({ error: 'Path is required' }, { status: 400 });
    }

    try {
        const rootPath = await ensureStorageInit();
        const fullPath = path.join(rootPath, relPath);

        if (!fullPath.startsWith(rootPath)) {
            return NextResponse.json({ error: 'Invalid path' }, { status: 403 });
        }

        // Ensure directory exists
        await fs.mkdir(path.dirname(fullPath), { recursive: true });

        // Check if file already exists
        try {
            await fs.access(fullPath);
            return NextResponse.json({ error: 'File already exists' }, { status: 409 });
        } catch {
            // File doesn't exist, proceed
        }

        await fs.writeFile(fullPath, content);
        return NextResponse.json({ success: true });
    } catch (error) {
        return NextResponse.json({ error: 'Failed to create file' }, { status: 500 });
    }
}

export async function PUT(request: Request) {
    const body = await request.json();
    const { path: relPath, content } = body;

    if (!relPath || content === undefined) {
        return NextResponse.json({ error: 'Path and content are required' }, { status: 400 });
    }

    try {
        const rootPath = await ensureStorageInit();
        const fullPath = path.join(rootPath, relPath);

        if (!fullPath.startsWith(rootPath)) {
            return NextResponse.json({ error: 'Invalid path' }, { status: 403 });
        }

        await fs.writeFile(fullPath, content);
        return NextResponse.json({ success: true });
    } catch (error) {
        return NextResponse.json({ error: 'Failed to update file' }, { status: 500 });
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
        const fullPath = path.join(rootPath, relPath);

        if (!fullPath.startsWith(rootPath)) {
            return NextResponse.json({ error: 'Invalid path' }, { status: 403 });
        }

        await fs.unlink(fullPath);
        return NextResponse.json({ success: true });
    } catch (error) {
        return NextResponse.json({ error: 'Failed to delete file' }, { status: 500 });
    }
}
