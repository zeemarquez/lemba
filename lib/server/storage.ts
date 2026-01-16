import path from 'path';
import fs from 'fs/promises';
import os from 'os';

const CONFIG_FILE = path.join(os.homedir(), '.markdown-editor-config.json');
const DEFAULT_STORAGE_PATH = path.join(os.homedir(), 'Documents', 'MarkdownEditor');

export interface AppConfig {
    storagePath: string;
}

export async function getConfig(): Promise<AppConfig> {
    try {
        const data = await fs.readFile(CONFIG_FILE, 'utf-8');
        return JSON.parse(data);
    } catch (error) {
        // If config doesn't exist, return default
        return { storagePath: DEFAULT_STORAGE_PATH };
    }
}

export async function saveConfig(config: AppConfig): Promise<void> {
    await fs.writeFile(CONFIG_FILE, JSON.stringify(config, null, 2));
}

export async function ensureStorageInit(): Promise<string> {
    const config = await getConfig();
    const root = config.storagePath;

    try {
        await fs.access(root);
    } catch {
        await fs.mkdir(root, { recursive: true });
    }

    const folders = ['Files', 'Templates'];
    for (const folder of folders) {
        const folderPath = path.join(root, folder);
        try {
            await fs.access(folderPath);
        } catch {
            await fs.mkdir(folderPath, { recursive: true });
        }
    }

    return root;
}
