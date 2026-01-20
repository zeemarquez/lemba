import { NextResponse } from 'next/server';
import { markdownToTypst } from '@/lib/typst/markdown-to-typst';
import { serializeNodesToTypst } from '@/lib/typst/serialize-nodes';
import { compileTypstToPdf, generatePreamble } from '@/lib/typst/compiler';
import { processTypstImages } from '@/lib/typst/image-manager';

async function headerFooterToTypst(content: string, context: { title?: string }): Promise<string> {
    if (!content) return '';
    try {
        const parsed = JSON.parse(content);
        if (Array.isArray(parsed) && parsed.length > 0) {
            return serializeNodesToTypst(parsed, { title: context.title });
        }
    } catch { }
    return markdownToTypst(content).trim();
}

export async function POST(req: Request) {
    try {
        const { markdown, title, settings } = await req.json();


        // 1. Convert
        const typstBody = markdownToTypst(markdown || '');

        // 2. Headers/Footers
        const headerContent = settings?.header?.enabled && settings?.header?.content
            ? await headerFooterToTypst(settings.header.content, { title })
            : '';
        const footerContent = settings?.footer?.enabled && settings?.footer?.content
            ? await headerFooterToTypst(settings.footer.content, { title })
            : '';

        // 3. Preamble
        const typstOptions = {
            ...settings,
            header: headerContent,
            footer: footerContent,
            fontFamily: settings?.fontFamily || 'Inter',
        };

        const preamble = generatePreamble(typstOptions);

        // 4. Combine and process images
        const fullSourceRaw = `${preamble}\n\n${typstBody}`;
        const typstResult = await processTypstImages(fullSourceRaw);
        const fullSource = typstResult.source;

        // 5. Compile to PDF
        const pdfBuffer = await compileTypstToPdf({
            source: fullSource,
            images: typstResult.images
        });

        // 6. Return PDF
        return new NextResponse(pdfBuffer as any, {
            headers: {
                'Content-Type': 'application/pdf',
            }
        });

    } catch (error: any) {
        console.error('PDF preview error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
