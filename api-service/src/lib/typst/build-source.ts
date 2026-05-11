/**
 * Builds the full Typst source for a document, matching the behaviour of
 * `hooks/use-pdf-compiler.ts#buildTypstSource` from the main app.
 *
 * In the main app the markdown editor can also store Plate document JSON
 * and convert it via `serialize-nodes`. The API only accepts raw markdown,
 * so we always go through the `markdownToTypst` path.
 */

import { markdownToTypst } from './markdown-to-typst';
import { resolveLucideIconsFromAlerts } from './lucide-svg';
import {
    generatePreamble,
    getEnabledHeadingLevels,
    TypstOptions,
} from './compiler';
import { processTypstImages } from './images';
import { parseVariablesFromFrontmatter } from '../frontmatter';

// Same shape as `TemplateSettings` in hooks/use-pdf-compiler.ts.
// Kept as `any` here to mirror the looseness of the source code and to
// avoid drift if the editor adds new settings in the future.
export type TemplateSettings = Record<string, any>;

export interface CompileOptions {
    markdown: string;
    title?: string;
    settings?: TemplateSettings;
    /**
     * Variable overrides. Variables embedded in the frontmatter of the
     * markdown document are still respected, but values from this object
     * take precedence so API clients can inject values without having to
     * rewrite the frontmatter.
     */
    variableOverrides?: Record<string, string>;
}

async function contentToTypst(content: string, context: {
    title?: string;
    scaleImages?: boolean;
    insideContext?: boolean;
    tables?: { preventPageBreak?: boolean; equalWidthColumns?: boolean; alignment?: 'left' | 'center' | 'right' };
    pageNumberOffset?: number;
    variables?: Record<string, string>;
    figures?: { captionEnabled?: boolean; captionFormat?: string };
    alerts?: any;
    resolvedLucideSvgs?: Record<string, string>;
}): Promise<string> {
    if (!content) return '';
    return markdownToTypst(content, {
        figures: context.figures,
        alerts: context.alerts,
        resolvedLucideSvgs: context.resolvedLucideSvgs,
        title: context.title,
        variables: context.variables,
        pageNumberOffset: context.pageNumberOffset,
        insideContext: context.insideContext,
    }).trim();
}

export async function buildTypstSource(options: CompileOptions): Promise<string> {
    const { markdown, title, settings, variableOverrides } = options;
    const safeMarkdown = markdown || '';

    // Frontmatter variables, then overrides on top.
    const frontmatterVars = parseVariablesFromFrontmatter(safeMarkdown);
    const variables: Record<string, string> = { ...frontmatterVars };
    if (variableOverrides) {
        for (const [k, v] of Object.entries(variableOverrides)) {
            if (v === undefined || v === null) continue;
            variables[k] = String(v);
        }
    }

    const resolvedLucideSvgs = await resolveLucideIconsFromAlerts(settings?.alerts);

    const startPageNumber = settings?.startPageNumber || 1;
    const pageNumberOffset = 1 - startPageNumber;

    const typstBody = markdownToTypst(safeMarkdown, {
        tables: settings?.tables,
        figures: settings?.figures,
        alerts: settings?.alerts,
        resolvedLucideSvgs,
        title,
        variables,
        pageNumberOffset,
    });

    let headerContent = '';
    let footerContent = '';
    let frontPageContent = '';

    if (settings?.header?.enabled && settings?.header?.content) {
        headerContent = await contentToTypst(settings.header.content, {
            title, scaleImages: true, insideContext: true, pageNumberOffset,
            variables, alerts: settings?.alerts, resolvedLucideSvgs,
        });
    }

    if (settings?.footer?.enabled && settings?.footer?.content) {
        footerContent = await contentToTypst(settings.footer.content, {
            title, scaleImages: true, insideContext: true, pageNumberOffset,
            variables, alerts: settings?.alerts, resolvedLucideSvgs,
        });
    }

    if (settings?.frontPage?.enabled) {
        if (settings.frontPage.uploadEnabled && settings.frontPage.uploadedImage) {
            const imgSrc = settings.frontPage.uploadedImage;
            frontPageContent = `#page(margin: 0pt, fill: white)[#image("${imgSrc}", width: 100%, height: 100%, fit: "cover")]`;
        } else if (settings.frontPage.content) {
            frontPageContent = await contentToTypst(settings.frontPage.content, {
                title, scaleImages: false, insideContext: false,
                tables: settings?.tables, pageNumberOffset, variables,
                figures: settings?.figures, alerts: settings?.alerts, resolvedLucideSvgs,
            });
        }
    }

    const typstOptions: TypstOptions = {
        ...settings,
        header: headerContent,
        headerMargins: settings?.header?.margins,
        headerStartPage: settings?.header?.startPage || 1,
        footer: footerContent,
        footerMargins: settings?.footer?.margins,
        footerStartPage: settings?.footer?.startPage || 1,
        fontFamily: settings?.fontFamily || 'Inter',
        frontPage: frontPageContent,
    };

    const preamble = generatePreamble(typstOptions);

    let bodyContent = '';
    let outlineContent = '';

    if (settings?.outline?.enabled) {
        const outlineSettings = settings.outline;
        const entriesSettings = outlineSettings.entries || {};
        const entriesFontSize = entriesSettings.fontSize || '12px';
        const entriesBold = entriesSettings.bold || false;
        const entriesItalic = entriesSettings.italic || false;
        const entriesUnderline = entriesSettings.underline || false;
        const entriesFiller = entriesSettings.filler || 'dotted';
        const entriesSizePt = entriesFontSize.replace('px', 'pt');

        let fillerTypst = 'repeat([.])';
        if (entriesFiller === 'line') fillerTypst = 'line(length: 100%)';
        else if (entriesFiller === 'empty') fillerTypst = 'none';

        const entryStyles: string[] = [`size: ${entriesSizePt}`];
        if (entriesBold) entryStyles.push('weight: "bold"');
        if (entriesItalic) entryStyles.push('style: "italic"');

        let titleTypst = '';
        if (outlineSettings.title?.content) {
            titleTypst = await contentToTypst(outlineSettings.title.content, {
                title, scaleImages: false, insideContext: false, pageNumberOffset,
            });
        }

        const textSetRule = `#set text(${entryStyles.join(', ')})`;
        const enabledLevels = getEnabledHeadingLevels(settings);

        const underlineWrapStart = entriesUnderline ? 'underline[' : '';
        const underlineWrapEnd = entriesUnderline ? ']' : '';

        const buildNumberingLogic = () => {
            let logic = '  let lvl = it.element.level\n';
            logic += '  let num-str = ""\n';
            if (enabledLevels.length === 0) return logic;
            enabledLevels.forEach((level, idx) => {
                const ancestorLevels = enabledLevels.filter(l => l <= level);
                const condition = idx === 0 ? 'if' : 'else if';
                logic += `  ${condition} lvl == ${level} {\n`;
                const parts = ancestorLevels.map(l => {
                    if (l === level) return `str(counter("h${l}-counter").at(loc).first() + 1)`;
                    return `str(counter("h${l}-counter").at(loc).first())`;
                });
                if (parts.length > 0) {
                    logic += `    num-str = ${parts.join(' + "." + ')} + "."\n`;
                }
                logic += '  }\n';
            });
            return logic;
        };

        const numberingLogic = buildNumberingLogic();

        let outlineShowRule = '';
        if (pageNumberOffset !== 0) {
            outlineShowRule = `
#show link: it => it.body
#show outline.entry: it => {
  let loc = it.element.location()
  let page-num = counter(page).at(loc).first()
  let adjusted-page = page-num + ${pageNumberOffset}
  let page-display = if adjusted-page >= 1 { str(adjusted-page) } else { "" }
${numberingLogic}
  block(link(loc, ${underlineWrapStart}it.indented([#num-str], [#it.body() #box(width: 1fr, it.fill) #page-display])${underlineWrapEnd}))
}`;
        } else {
            outlineShowRule = `
#show link: it => it.body
#show outline.entry: it => {
  let loc = it.element.location()
${numberingLogic}
  block(link(loc, ${underlineWrapStart}it.indented([#num-str], [#it.body() #box(width: 1fr, it.fill) #it.page()])${underlineWrapEnd}))
}`;
        }

        const outlineEmptyPages = settings.outline?.emptyPagesAfter || 0;
        let outlineEmptyPagesTypst = '';
        for (let i = 0; i < outlineEmptyPages; i++) outlineEmptyPagesTypst += '#page[]\n';

        outlineContent = `// Table of Contents
${titleTypst}
#v(1em)
#set outline.entry(fill: ${fillerTypst})
${textSetRule}
${outlineShowRule}
#outline(title: none)
#pagebreak()
${outlineEmptyPagesTypst}
`;
    }

    const frontPageEmptyPages = settings?.frontPage?.emptyPagesAfter || 0;
    let frontPageEmptyPagesTypst = '';
    for (let i = 0; i < frontPageEmptyPages; i++) frontPageEmptyPagesTypst += '#page[]\n';

    if (frontPageContent) {
        const frontPageSeparator = settings?.frontPage?.uploadEnabled ? '\n' : '\n#pagebreak()\n';
        bodyContent = `${frontPageContent}${frontPageSeparator}${frontPageEmptyPagesTypst}${outlineContent}`;
    } else if (outlineContent) {
        bodyContent = `${outlineContent}`;
    }

    const columns = settings?.columns || 1;
    let processedBody = typstBody;
    if (columns > 1) {
        processedBody = `#columns(${columns}, gutter: 4mm)[
${processedBody}
]`;
    }

    bodyContent += processedBody;

    const fullSourceRaw = `${preamble}\n\n${bodyContent}`;
    const typstResult = await processTypstImages(fullSourceRaw);
    return typstResult.source;
}
