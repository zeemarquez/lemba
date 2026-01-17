import { NextResponse } from 'next/server';
import { ensureStorageInit } from '@/lib/server/storage';
import fs from 'fs/promises';
import path from 'path';

export async function POST(request: Request) {
    const body = await request.json();
    const { path: relPath, content } = body;

    if (!relPath || !content) {
        return NextResponse.json({ error: 'Path and content are required' }, { status: 400 });
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
            return NextResponse.json({ error: 'Template already exists' }, { status: 409 });
        } catch {
            // File doesn't exist, proceed
        }

        await fs.writeFile(fullPath, JSON.stringify(content, null, 2));
        return NextResponse.json({ success: true });
    } catch (error) {
        return NextResponse.json({ error: 'Failed to create template' }, { status: 500 });
    }
}

export async function PUT(request: Request) {
    const body = await request.json();
    const { path: relPath, content } = body;

    if (!relPath || !content) {
        return NextResponse.json({ error: 'Path and content are required' }, { status: 400 });
    }

    try {
        const rootPath = await ensureStorageInit();
        const fullPath = path.join(rootPath, relPath);

        if (!fullPath.startsWith(rootPath)) {
            return NextResponse.json({ error: 'Invalid path' }, { status: 403 });
        }

        await fs.writeFile(fullPath, JSON.stringify(content, null, 2));
        return NextResponse.json({ success: true });
    } catch (error) {
        return NextResponse.json({ error: 'Failed to update template' }, { status: 500 });
    }
}
