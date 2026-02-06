import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-static';
export const revalidate = 0;

/**
 * API Route: Fetch URL Content
 * Fetches content from a URL and extracts text for RAG context
 */
export async function GET(request: NextRequest) {
    const searchParams = request.nextUrl.searchParams;
    const url = searchParams.get('url');

    if (!url) {
        return NextResponse.json({ error: 'URL parameter is required' }, { status: 400 });
    }

    try {
        // Validate URL
        const parsedUrl = new URL(url);
        if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
            return NextResponse.json({ error: 'Invalid URL protocol' }, { status: 400 });
        }

        // Create a timeout controller for better compatibility
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 10000);

        // Fetch the URL content
        const response = await fetch(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
                'Accept-Language': 'en-US,en;q=0.9',
                'Cache-Control': 'no-cache',
                'Pragma': 'no-cache',
            },
            signal: controller.signal,
        });
        clearTimeout(timeoutId);

        if (!response.ok) {
            return NextResponse.json({
                error: `Failed to fetch URL: ${response.status} ${response.statusText}`,
                content: ''
            }, { status: 200 }); // Return 200 so the client can still attach the URL
        }

        const contentType = response.headers.get('content-type') || '';
        let content = '';

        if (contentType.includes('text/html')) {
            // Parse HTML and extract text content
            const html = await response.text();
            content = extractTextFromHtml(html);
        } else if (contentType.includes('text/plain') || contentType.includes('text/markdown')) {
            // Plain text or markdown - use as-is
            content = await response.text();
        } else if (contentType.includes('application/json')) {
            // JSON - stringify with formatting
            const json = await response.json();
            content = JSON.stringify(json, null, 2);
        } else {
            // Unsupported content type
            return NextResponse.json({
                error: `Unsupported content type: ${contentType}`,
                content: ''
            }, { status: 200 });
        }

        // Truncate if too long (max ~50k chars to avoid token limits)
        const maxLength = 50000;
        if (content.length > maxLength) {
            content = content.substring(0, maxLength) + '\n\n[Content truncated due to length...]';
        }

        return NextResponse.json({
            content,
            url,
            contentType,
            length: content.length
        });

    } catch (error) {
        console.error('Error fetching URL:', error);
        return NextResponse.json({
            error: error instanceof Error ? error.message : 'Failed to fetch URL',
            content: ''
        }, { status: 200 }); // Return 200 so the client can still attach the URL
    }
}

/**
 * Extract readable text from HTML
 * Simple extraction that removes scripts, styles, and extracts meaningful text
 */
function extractTextFromHtml(html: string): string {
    // Remove script and style tags with their content
    let text = html
        .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
        .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
        .replace(/<noscript[^>]*>[\s\S]*?<\/noscript>/gi, '')
        .replace(/<!--[\s\S]*?-->/g, '');

    // Extract title
    const titleMatch = text.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
    const title = titleMatch ? titleMatch[1].trim() : '';

    // Extract main content areas (article, main, body)
    let mainContent = '';
    const articleMatch = text.match(/<article[^>]*>([\s\S]*?)<\/article>/i);
    const mainMatch = text.match(/<main[^>]*>([\s\S]*?)<\/main>/i);

    if (articleMatch) {
        mainContent = articleMatch[1];
    } else if (mainMatch) {
        mainContent = mainMatch[1];
    } else {
        // Fall back to body
        const bodyMatch = text.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
        mainContent = bodyMatch ? bodyMatch[1] : text;
    }

    // Convert common HTML elements to text
    mainContent = mainContent
        // Convert headings to markdown-style
        .replace(/<h1[^>]*>([\s\S]*?)<\/h1>/gi, '\n# $1\n')
        .replace(/<h2[^>]*>([\s\S]*?)<\/h2>/gi, '\n## $1\n')
        .replace(/<h3[^>]*>([\s\S]*?)<\/h3>/gi, '\n### $1\n')
        .replace(/<h4[^>]*>([\s\S]*?)<\/h4>/gi, '\n#### $1\n')
        .replace(/<h5[^>]*>([\s\S]*?)<\/h5>/gi, '\n##### $1\n')
        .replace(/<h6[^>]*>([\s\S]*?)<\/h6>/gi, '\n###### $1\n')
        // Convert paragraphs and divs to newlines
        .replace(/<\/p>/gi, '\n\n')
        .replace(/<\/div>/gi, '\n')
        .replace(/<br\s*\/?>/gi, '\n')
        // Convert lists
        .replace(/<li[^>]*>([\s\S]*?)<\/li>/gi, '• $1\n')
        // Remove remaining HTML tags
        .replace(/<[^>]+>/g, ' ')
        // Decode HTML entities
        .replace(/&nbsp;/g, ' ')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/&ldquo;/g, '"')
        .replace(/&rdquo;/g, '"')
        .replace(/&lsquo;/g, "'")
        .replace(/&rsquo;/g, "'")
        .replace(/&mdash;/g, '—')
        .replace(/&ndash;/g, '–')
        // Clean up whitespace
        .replace(/\s+/g, ' ')
        .replace(/\n\s+/g, '\n')
        .replace(/\n{3,}/g, '\n\n')
        .trim();

    // Combine title and content
    if (title && !mainContent.startsWith(title)) {
        return `# ${title}\n\n${mainContent}`;
    }

    return mainContent;
}
