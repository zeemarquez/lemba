import { NextResponse } from 'next/server';
import { ensureStorageInit } from '@/lib/server/storage';
import fs from 'fs/promises';
import path from 'path';

export async function GET() {
    try {
        const rootPath = await ensureStorageInit();
        const templatesPath = path.join(rootPath, 'Templates');
        
        // Ensure templates folder exists (ensureStorageInit does this, but good to be safe)
        try {
             await fs.access(templatesPath);
        } catch {
             return NextResponse.json({ templates: [] });
        }

        const entries = await fs.readdir(templatesPath, { withFileTypes: true });
        const templates = [];

        for (const entry of entries) {
            if (entry.isFile() && (entry.name.endsWith('.mdt') || entry.name.endsWith('.json'))) {
                try {
                    const content = await fs.readFile(path.join(templatesPath, entry.name), 'utf-8');
                    const template = JSON.parse(content);
                    
                    template.id = `Templates/${entry.name}`;
                    templates.push(template);
                } catch (e) {
                    console.error(`Failed to parse template ${entry.name}`, e);
                }
            }
        }

        return NextResponse.json({ templates });
    } catch (error) {
        return NextResponse.json({ error: 'Failed to list templates' }, { status: 500 });
    }
}
