/**
 * High-level conversion API. Given a markdown document, a template (the
 * raw `.mdt` JSON object), optional variable overrides and optional
 * custom fonts, produce a PDF byte buffer.
 */

import {
    initializeCompiler,
    compileTypstToPdf,
    resetCompiler,
} from './typst/compiler';
import { buildTypstSource, TemplateSettings } from './typst/build-source';
import { getPreloadedFontInputs } from './preloaded-fonts-node';
import { registerFonts, FontInput } from './typst/fonts';

export interface Template {
    id?: string;
    name?: string;
    settings?: TemplateSettings;
    [key: string]: unknown;
}

export interface ConvertRequest {
    markdown: string;
    template?: Template | null;
    title?: string;
    variables?: Record<string, string>;
    fonts?: FontInput[];
}

export interface ConvertResult {
    pdf: Uint8Array;
    /** Sanity-checked Typst source — useful for debugging client integrations. */
    typstSource?: string;
}

/**
 * The WASM compiler is a singleton: only one document can be compiled at a
 * time and font registration mutates global state. We serialize requests
 * through this promise chain so multiple concurrent API calls behave
 * predictably.
 */
let queue: Promise<unknown> = Promise.resolve();

function enqueue<T>(task: () => Promise<T>): Promise<T> {
    const run = queue.then(task, task);
    queue = run.catch(() => undefined);
    return run;
}

export async function convertMarkdownToPdf(req: ConvertRequest, opts?: { includeSource?: boolean }): Promise<ConvertResult> {
    return enqueue(async () => {
        const { markdown, template, title, variables, fonts } = req;
        if (!markdown && markdown !== '') {
            throw new Error('`markdown` is required');
        }

        const preloaded = await getPreloadedFontInputs();
        await registerFonts([...preloaded, ...(fonts || [])]);
        await initializeCompiler();
        await resetCompiler();

        const source = await buildTypstSource({
            markdown,
            title,
            settings: template?.settings,
            variableOverrides: variables,
        });

        const pdf = await compileTypstToPdf({ source });
        return {
            pdf,
            typstSource: opts?.includeSource ? source : undefined,
        };
    });
}
