import { NextResponse } from 'next/server';
import { getConfig, saveConfig, ensureStorageInit } from '@/lib/server/storage';

export async function GET() {
    const config = await getConfig();
    return NextResponse.json(config);
}

export async function POST(request: Request) {
    const body = await request.json();
    const { storagePath } = body;

    if (!storagePath) {
        return NextResponse.json({ error: 'Storage path is required' }, { status: 400 });
    }

    await saveConfig({ storagePath });
    await ensureStorageInit();

    return NextResponse.json({ success: true, storagePath });
}
