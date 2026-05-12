/**
 * Convert the public `*_raw` / `*_file` / `*_cloud_filepath` argument shapes
 * into concrete inputs for the converter.
 *
 * Used by both the REST routes and the MCP tools so they share one notion of
 * "one of three sources" for markdown, templates, and fonts.
 */

import type { Template } from './converter';
import type { FontInput } from './typst/fonts';
import {
    getUserFileByPath,
    getUserMarkdownFileByPath,
    getUserFontByIdentifier,
} from './cloud-store';

export class ResolutionError extends Error {
    status: number;
    constructor(message: string, status = 400) {
        super(message);
        this.status = status;
        this.name = 'ResolutionError';
    }
}

// ==================== Markdown ====================

export interface MarkdownSource {
    md_raw?: string;
    /** Alias: legacy `markdown` field. */
    markdown?: string;
    md_file?: string; // pre-read file contents (UTF-8)
    md_cloud_filepath?: string;
}

export async function resolveMarkdown(
    source: MarkdownSource,
    ctx: { userId?: string },
): Promise<{ markdown: string; cloudPath?: string }> {
    const provided: Array<'md_raw' | 'md_file' | 'md_cloud_filepath'> = [];
    if (typeof source.md_raw === 'string' || typeof source.markdown === 'string') provided.push('md_raw');
    if (typeof source.md_file === 'string') provided.push('md_file');
    if (typeof source.md_cloud_filepath === 'string' && source.md_cloud_filepath.length > 0) {
        provided.push('md_cloud_filepath');
    }
    if (provided.length === 0) {
        throw new ResolutionError(
            'Exactly one markdown source is required: `md_raw`, `md_file`, or `md_cloud_filepath`.',
        );
    }
    if (provided.length > 1) {
        throw new ResolutionError(
            `Only one markdown source may be provided. Got: ${provided.join(', ')}.`,
        );
    }

    if (typeof source.md_raw === 'string') return { markdown: source.md_raw };
    if (typeof source.markdown === 'string') return { markdown: source.markdown };
    if (typeof source.md_file === 'string') return { markdown: source.md_file };

    const cloudPath = source.md_cloud_filepath!;
    if (!ctx.userId) {
        throw new ResolutionError('`md_cloud_filepath` requires an authenticated user API key.', 401);
    }
    const file = await getUserMarkdownFileByPath(ctx.userId, cloudPath);
    if (!file) {
        throw new ResolutionError(`Markdown file not found in your cloud storage: ${cloudPath}`, 404);
    }
    return { markdown: file.content, cloudPath: file.path };
}

// ==================== Template ====================

export interface TemplateSource {
    template_raw?: Template | string | null;
    /** Alias: legacy `template` field. */
    template?: Template | string | null;
    template_file?: string; // pre-read JSON string
    template_cloud_filepath?: string;
}

function parseTemplateJson(value: unknown, fieldName: string): Template | null {
    if (value === null || value === undefined || value === '') return null;
    if (typeof value === 'object') return value as Template;
    if (typeof value === 'string') {
        try {
            return JSON.parse(value) as Template;
        } catch (e) {
            throw new ResolutionError(
                `Field \`${fieldName}\` must be valid JSON: ${(e as Error).message}`,
            );
        }
    }
    throw new ResolutionError(`Field \`${fieldName}\` has an unsupported type`);
}

export async function resolveTemplate(
    source: TemplateSource,
    ctx: { userId?: string },
): Promise<{ template: Template | null; cloudPath?: string }> {
    const provided: Array<'template_raw' | 'template_file' | 'template_cloud_filepath'> = [];
    const rawPresent =
        source.template_raw !== undefined && source.template_raw !== null && source.template_raw !== '';
    const legacyPresent =
        source.template !== undefined && source.template !== null && source.template !== '';
    if (rawPresent || legacyPresent) provided.push('template_raw');
    if (typeof source.template_file === 'string' && source.template_file.length > 0) {
        provided.push('template_file');
    }
    if (typeof source.template_cloud_filepath === 'string' && source.template_cloud_filepath.length > 0) {
        provided.push('template_cloud_filepath');
    }

    if (provided.length === 0) return { template: null };
    if (provided.length > 1) {
        throw new ResolutionError(
            `Only one template source may be provided. Got: ${provided.join(', ')}.`,
        );
    }

    if (rawPresent) return { template: parseTemplateJson(source.template_raw, 'template_raw') };
    if (legacyPresent) return { template: parseTemplateJson(source.template, 'template') };
    if (typeof source.template_file === 'string') {
        return { template: parseTemplateJson(source.template_file, 'template_file') };
    }

    const cloudPath = source.template_cloud_filepath!;
    if (!ctx.userId) {
        throw new ResolutionError(
            '`template_cloud_filepath` requires an authenticated user API key.',
            401,
        );
    }
    const file = await getUserFileByPath(ctx.userId, cloudPath);
    if (!file) {
        throw new ResolutionError(`Template not found in your cloud storage: ${cloudPath}`, 404);
    }
    let parsed: Template;
    try {
        parsed = JSON.parse(file.content) as Template;
    } catch (e) {
        throw new ResolutionError(
            `Cloud template "${cloudPath}" is not valid JSON: ${(e as Error).message}`,
            500,
        );
    }
    return { template: parsed, cloudPath: file.path };
}

// ==================== Fonts ====================

export interface FontSourceEntry {
    family?: string;
    /** Embedded font bytes as base64. */
    font_raw?: string;
    /** Pre-read bytes (used by multipart). */
    font_file?: Uint8Array;
    /** URL alias for backwards compat. */
    url?: string;
    /** Cloud font identifier (font id slug, or family name). */
    font_cloud_filepath?: string;
    /** Legacy: base64 data field. */
    dataBase64?: string;
    /** Legacy: raw bytes. */
    data?: Uint8Array;
}

export async function resolveFonts(
    entries: FontSourceEntry[] | undefined,
    ctx: { userId?: string },
): Promise<FontInput[]> {
    if (!entries?.length) return [];
    const out: FontInput[] = [];

    for (const entry of entries) {
        const family = entry.family;
        const sourcesPresent: string[] = [];
        if (entry.font_raw) sourcesPresent.push('font_raw');
        if (entry.dataBase64) sourcesPresent.push('dataBase64');
        if (entry.font_file && entry.font_file.byteLength > 0) sourcesPresent.push('font_file');
        if (entry.data && entry.data.byteLength > 0) sourcesPresent.push('data');
        if (entry.url) sourcesPresent.push('url');
        if (entry.font_cloud_filepath) sourcesPresent.push('font_cloud_filepath');

        if (sourcesPresent.length === 0) continue;
        if (sourcesPresent.length > 1) {
            throw new ResolutionError(
                `Each font may declare only one source. Got: ${sourcesPresent.join(', ')}.`,
            );
        }

        const onlySource = sourcesPresent[0]!;
        if (onlySource === 'font_raw' || onlySource === 'dataBase64') {
            const b64 = (entry.font_raw ?? entry.dataBase64) || '';
            try {
                out.push({ family, data: new Uint8Array(Buffer.from(b64, 'base64')) });
            } catch (e) {
                throw new ResolutionError(
                    `Failed to decode base64 font data: ${(e as Error).message}`,
                );
            }
            continue;
        }
        if (onlySource === 'font_file' || onlySource === 'data') {
            const bytes = (entry.font_file ?? entry.data)!;
            out.push({ family, data: new Uint8Array(bytes) });
            continue;
        }
        if (onlySource === 'url') {
            out.push({ family, url: entry.url });
            continue;
        }
        if (onlySource === 'font_cloud_filepath') {
            if (!ctx.userId) {
                throw new ResolutionError(
                    '`font_cloud_filepath` requires an authenticated user API key.',
                    401,
                );
            }
            const cloudFont = await getUserFontByIdentifier(ctx.userId, entry.font_cloud_filepath!);
            if (!cloudFont) {
                throw new ResolutionError(
                    `Font not found in your cloud storage: ${entry.font_cloud_filepath}`,
                    404,
                );
            }
            if (!cloudFont.data || cloudFont.data.byteLength === 0) {
                throw new ResolutionError(
                    `Font "${cloudFont.family}" was synced without binary data (file too large). Re-upload it locally.`,
                    409,
                );
            }
            out.push({ family: family || cloudFont.family, data: cloudFont.data });
            continue;
        }
    }
    return out;
}
