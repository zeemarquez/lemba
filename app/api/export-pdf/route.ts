import { NextResponse } from 'next/server';
import { markdownToTypst } from '@/lib/typst/markdown-to-typst';
import { serializeNodesToTypst } from '@/lib/typst/serialize-nodes';
import { compileTypstToPdf, generatePreamble } from '@/lib/typst/compiler';
import { processTypstImages } from '@/lib/typst/image-manager';

// Helper to convert header/footer content to Typst
async function headerFooterToTypst(content: string, context: { title?: string }): Promise<string> {
    if (!content) return '';

    try {
        const parsed = JSON.parse(content);
        if (Array.isArray(parsed) && parsed.length > 0) {
            // It's Plate content (JSON)
            return serializeNodesToTypst(parsed, { title: context.title });
        }
    } catch {
        // Not JSON, assume markdown string
    }

    // For markdown headers, we use our converter
    // Note: markdownToTypst adds newlines, trim if needed?
    return markdownToTypst(content).trim();
}

export async function POST(req: Request) {
    try {
        const { markdown, title, settings } = await req.json();

        // 1. Convert Body Markdown to Typst
        const typstResult = await processTypstImages(markdownToTypst(markdown || ''));
        const typstBody = typstResult.source;

        // 3. Prepare Header/Footer
        const headerContent = settings?.header?.enabled && settings?.header?.content
            ? await headerFooterToTypst(settings.header.content, { title })
            : '';

        const footerContent = settings?.footer?.enabled && settings?.footer?.content
            ? await headerFooterToTypst(settings.footer.content, { title })
            : '';

        // 4. Generate Preamble
        // Merge header/footer into settings for preamble generator
        const typstOptions = {
            ...settings,
            header: headerContent,
            footer: footerContent,
            fontFamily: settings?.fontFamily || 'Inter',
        };

        const preamble = generatePreamble(typstOptions);

        // 5. Combine
        // We ensure body starts cleanly
        const fullSource = `${preamble}\n\n${typstBody}`;

        // 6. Compile
        // This returns a Buffer
        const pdfBuffer = await compileTypstToPdf({
            source: fullSource,
            images: typstResult.images
        });

        return new Response(pdfBuffer as any, {
            headers: {
                'Content-Type': 'application/pdf',
                'Content-Disposition': 'attachment; filename="export.pdf"',
            },
        });

    } catch (error: any) {
        console.error('PDF export error:', error);
        // Return 500
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
