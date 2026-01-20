import { Browser } from 'puppeteer-core';
import { Marked } from 'marked';
import markedKatex from "marked-katex-extension";
import { markedHighlight } from "marked-highlight";
import hljs from 'highlight.js';
import { NextResponse } from 'next/server';
import { serializeNodesToHtml, processHtmlImageCaptions } from '@/lib/plate/serialize-html';
import { generatePdfCss } from '@/app/api/export-pdf/route';

// Reusable browser instance for faster preview generation
let browserInstance: Browser | null = null;
let browserLastUsed = 0;
const BROWSER_IDLE_TIMEOUT = 60000; // Close browser after 1 minute of inactivity

async function getBrowser(): Promise<Browser> {
    browserLastUsed = Date.now();

    if (browserInstance && browserInstance.connected) {
        return browserInstance;
    }

    if (process.env.VERCEL) {
        const chromium = await import('@sparticuz/chromium').then(mod => mod.default) as any;
        const puppeteerCore = await import('puppeteer-core').then(mod => mod.default);

        browserInstance = await puppeteerCore.launch({
            args: chromium.args,
            defaultViewport: chromium.defaultViewport,
            executablePath: await chromium.executablePath(),
            headless: chromium.headless,
        }) as Browser;
    } else {
        const puppeteer = await import('puppeteer').then(mod => mod.default);
        browserInstance = await puppeteer.launch({
            headless: true,
            args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu', '--disable-dev-shm-usage'],
        }) as unknown as Browser;
    }

    // Set up auto-close on idle
    const checkIdle = setInterval(async () => {
        if (Date.now() - browserLastUsed > BROWSER_IDLE_TIMEOUT && browserInstance) {
            await browserInstance.close();
            browserInstance = null;
            clearInterval(checkIdle);
        }
    }, 10000);

    return browserInstance as Browser;
}

// Create a configured marked instance for reliable math rendering
function createMarkedInstance() {
    const instance = new Marked();

    instance.use(markedKatex({
        throwOnError: false,
        output: 'html',
        nonStandard: true,
    }));

    instance.use(markedHighlight({
        emptyLangClass: 'hljs',
        langPrefix: 'hljs language-',
        highlight(code, lang) {
            const language = hljs.getLanguage(lang) ? lang : 'plaintext';
            return hljs.highlight(code, { language }).value;
        }
    }));

    return instance;
}

const markedInstance = createMarkedInstance();

async function headerFooterToHtml(content: string, context: { title?: string }): Promise<string> {
    if (!content) return '';

    try {
        const parsed = JSON.parse(content);
        if (Array.isArray(parsed) && parsed.length > 0) {
            return serializeNodesToHtml(parsed, { title: context.title });
        }
    } catch {
        // Not JSON, try markdown
    }

    let html = markedInstance.parse(content) as string;
    if (context.title) html = html.replace(/{title}/g, context.title);
    html = html.replace(/{date}/g, new Date().toLocaleDateString());

    return html;
}

// Quality settings for preview rendering
const QUALITY_SETTINGS = {
    low: { scale: 0.75, jpegQuality: 0.4 },
    medium: { scale: 1.0, jpegQuality: 0.6 },
    high: { scale: 1.5, jpegQuality: 0.85 },
};

export async function POST(req: Request) {
    try {
        const { markdown, title, settings, quality = 'medium' } = await req.json();
        const qualityConfig = QUALITY_SETTINGS[quality as keyof typeof QUALITY_SETTINGS] || QUALITY_SETTINGS.medium;

        // Convert markdown to HTML using marked
        let htmlContent = markedInstance.parse(markdown || '') as string;
        htmlContent = processHtmlImageCaptions(htmlContent);
        htmlContent = htmlContent.replace(
            /<!--\s*pagebreak\s*-->/gi,
            '<div class="manual-page-break"></div>'
        );

        // Convert header/footer content to HTML
        const headerContent = settings?.header?.enabled && settings?.header?.content
            ? await headerFooterToHtml(settings.header.content, { title })
            : '';
        const footerContent = settings?.footer?.enabled && settings?.footer?.content
            ? await headerFooterToHtml(settings.footer.content, { title })
            : '';

        const headerHtml = headerContent ? `<div class="page-header">${headerContent}</div>` : '';
        const footerHtml = footerContent ? `<div class="page-footer">${footerContent}</div>` : '';

        let pdfCss = generatePdfCss(settings);

        const headerMatch = settings?.header?.content?.match(/"offset":\s*(\d+)/);
        const footerMatch = settings?.footer?.content?.match(/"offset":\s*(\d+)/);
        const offset = headerMatch ? parseInt(headerMatch[1]) : (footerMatch ? parseInt(footerMatch[1]) : 0);

        if (offset > 0) {
            pdfCss += `\nbody { counter-reset: page ${offset}; }`;
        }

        const margins = settings?.margins || { top: '20mm', bottom: '20mm', left: '20mm', right: '20mm' };

        const fullHtml = `
            <!DOCTYPE html>
            <html>
            <head>
                <meta charset="utf-8">
                <link rel="preconnect" href="https://fonts.googleapis.com">
                <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
                <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400..700&family=JetBrains+Mono:wght@400..700&family=Outfit:wght@400..700&family=Times+New+Roman&display=swap" rel="stylesheet">
                <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/katex@0.16.27/dist/katex.min.css" crossorigin="anonymous">
                <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/styles/${settings?.codeBlockTheme || 'github'}.min.css">
                <style>${pdfCss}</style>
            </head>
            <body>
                ${headerHtml}
                <div class="prose">${htmlContent}</div>
                ${footerHtml}
            </body>
            </html>
        `;

        // Reuse browser instance for speed
        const browser = await getBrowser();

        const page = await browser.newPage();

        try {
            // Use domcontentloaded instead of networkidle0 for speed (fonts may still be loading)
            await page.setContent(fullHtml, { waitUntil: 'domcontentloaded' });

            // Small delay for fonts to load
            await new Promise(resolve => setTimeout(resolve, 100));

            // Generate PDF buffer
            const pdfBuffer = await page.pdf({
                format: 'A4',
                landscape: settings?.pageLayout === 'horizontal',
                margin: {
                    top: margins.top,
                    right: margins.right,
                    bottom: margins.bottom,
                    left: margins.left,
                },
                printBackground: true,
            });

            // Convert PDF pages to images using a new page
            const pdfPage = await browser.newPage();

            try {
                const pdfBase64 = Buffer.from(pdfBuffer).toString('base64');

                // Use pdf.js with configurable resolution based on quality setting
                await pdfPage.setContent(`
                    <!DOCTYPE html>
                    <html>
                    <head>
                        <script src="https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js"></script>
                        <script>pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';</script>
                    </head>
                    <body>
                        <canvas id="canvas"></canvas>
                        <script>
                            window.renderPdfPages = async function(pdfData, renderScale, jpegQuality) {
                                const pdf = await pdfjsLib.getDocument({ data: atob(pdfData) }).promise;
                                const images = [];
                                
                                for (let i = 1; i <= pdf.numPages; i++) {
                                    const page = await pdf.getPage(i);
                                    const viewport = page.getViewport({ scale: renderScale });
                                    
                                    const canvas = document.getElementById('canvas');
                                    canvas.width = viewport.width;
                                    canvas.height = viewport.height;
                                    
                                    const context = canvas.getContext('2d');
                                    context.fillStyle = 'white';
                                    context.fillRect(0, 0, canvas.width, canvas.height);
                                    
                                    await page.render({ canvasContext: context, viewport }).promise;
                                    images.push(canvas.toDataURL('image/jpeg', jpegQuality));
                                }
                                
                                return images;
                            };
                        </script>
                    </body>
                    </html>
                `, { waitUntil: 'domcontentloaded' });

                // Render PDF pages to images with quality settings
                const images = await pdfPage.evaluate(async (pdfBase64: string, scale: number, jpegQuality: number) => {
                    return await (window as any).renderPdfPages(pdfBase64, scale, jpegQuality);
                }, pdfBase64, qualityConfig.scale, qualityConfig.jpegQuality);

                return NextResponse.json({
                    pages: images,
                    pageCount: images.length
                });
            } finally {
                await pdfPage.close();
            }
        } finally {
            await page.close();
        }
    } catch (error: any) {
        console.error('PDF preview error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
