/**
 * Web Search Tool
 * Provides web search capabilities for the Researcher agent
 */

export interface WebSearchResult {
    title: string;
    url: string;
    snippet: string;
    source?: string;
}

export interface WebSearchResponse {
    query: string;
    results: WebSearchResult[];
    totalResults?: number;
}

/**
 * Search the web using a search API
 * 
 * This implementation supports multiple backends:
 * 1. DuckDuckGo Instant Answers API (default, no API key needed)
 * 2. Serper API (if SERPER_API_KEY is set)
 * 3. Brave Search API (if BRAVE_API_KEY is set)
 */
export async function webSearch(
    query: string,
    numResults: number = 5
): Promise<WebSearchResponse> {
    // Try different search backends based on available API keys
    const serperKey = getEnvVar('SERPER_API_KEY') || getEnvVar('NEXT_PUBLIC_SERPER_API_KEY');
    const braveKey = getEnvVar('BRAVE_API_KEY') || getEnvVar('NEXT_PUBLIC_BRAVE_API_KEY');

    if (serperKey) {
        return searchWithSerper(query, numResults, serperKey);
    }

    if (braveKey) {
        return searchWithBrave(query, numResults, braveKey);
    }

    // Fallback to DuckDuckGo (limited but free, no API key needed)
    return searchWithDuckDuckGo(query);
}

/**
 * Get environment variable (works in both Node and browser)
 */
function getEnvVar(name: string): string | undefined {
    if (typeof window !== 'undefined') {
        return (process.env as Record<string, string | undefined>)[name];
    }
    return process.env[name];
}

/**
 * Search using Serper API (Google Search)
 */
async function searchWithSerper(
    query: string,
    numResults: number,
    apiKey: string
): Promise<WebSearchResponse> {
    try {
        const response = await fetch('https://google.serper.dev/search', {
            method: 'POST',
            headers: {
                'X-API-KEY': apiKey,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                q: query,
                num: numResults
            })
        });

        if (!response.ok) {
            throw new Error(`Serper API error: ${response.status}`);
        }

        const data = await response.json();

        const results: WebSearchResult[] = (data.organic || []).map((item: {
            title: string;
            link: string;
            snippet: string;
        }) => ({
            title: item.title,
            url: item.link,
            snippet: item.snippet,
            source: 'Google via Serper'
        }));

        return {
            query,
            results,
            totalResults: data.searchInformation?.totalResults
        };
    } catch (error) {
        console.error('Serper search error:', error);
        // Fallback to DuckDuckGo
        return searchWithDuckDuckGo(query);
    }
}

/**
 * Search using Brave Search API
 */
async function searchWithBrave(
    query: string,
    numResults: number,
    apiKey: string
): Promise<WebSearchResponse> {
    try {
        const params = new URLSearchParams({
            q: query,
            count: String(numResults)
        });

        const response = await fetch(`https://api.search.brave.com/res/v1/web/search?${params}`, {
            headers: {
                'X-Subscription-Token': apiKey,
                'Accept': 'application/json'
            }
        });

        if (!response.ok) {
            throw new Error(`Brave API error: ${response.status}`);
        }

        const data = await response.json();

        const results: WebSearchResult[] = (data.web?.results || []).map((item: {
            title: string;
            url: string;
            description: string;
        }) => ({
            title: item.title,
            url: item.url,
            snippet: item.description,
            source: 'Brave Search'
        }));

        return {
            query,
            results,
            totalResults: data.web?.totalResults
        };
    } catch (error) {
        console.error('Brave search error:', error);
        // Fallback to DuckDuckGo
        return searchWithDuckDuckGo(query);
    }
}

/**
 * Search using DuckDuckGo Instant Answers API
 * Note: This is limited to instant answers, not full web search
 */
async function searchWithDuckDuckGo(query: string): Promise<WebSearchResponse> {
    try {
        const params = new URLSearchParams({
            q: query,
            format: 'json',
            no_html: '1',
            skip_disambig: '1'
        });

        const response = await fetch(`https://api.duckduckgo.com/?${params}`);

        if (!response.ok) {
            throw new Error(`DuckDuckGo API error: ${response.status}`);
        }

        const data = await response.json();
        const results: WebSearchResult[] = [];

        // Add main abstract if available
        if (data.Abstract) {
            results.push({
                title: data.Heading || query,
                url: data.AbstractURL || '',
                snippet: data.Abstract,
                source: data.AbstractSource || 'DuckDuckGo'
            });
        }

        // Add related topics
        if (data.RelatedTopics) {
            for (const topic of data.RelatedTopics.slice(0, 5)) {
                if (topic.Text && topic.FirstURL) {
                    results.push({
                        title: topic.Text.split(' - ')[0] || '',
                        url: topic.FirstURL,
                        snippet: topic.Text,
                        source: 'DuckDuckGo'
                    });
                }
            }
        }

        // If no results, indicate that
        if (results.length === 0) {
            return {
                query,
                results: [{
                    title: 'No instant answers available',
                    url: `https://duckduckgo.com/?q=${encodeURIComponent(query)}`,
                    snippet: `No instant answers found for "${query}". Consider using a search API like Serper or Brave for full web search results.`,
                    source: 'DuckDuckGo'
                }]
            };
        }

        return {
            query,
            results
        };
    } catch (error) {
        console.error('DuckDuckGo search error:', error);
        return {
            query,
            results: [{
                title: 'Search unavailable',
                url: '',
                snippet: `Web search is currently unavailable. Error: ${String(error)}`,
                source: 'Error'
            }]
        };
    }
}

/**
 * Format search results for display
 */
export function formatSearchResults(response: WebSearchResponse): string {
    if (response.results.length === 0) {
        return `No results found for "${response.query}"`;
    }

    let output = `## Web Search Results for: "${response.query}"\n\n`;

    for (let i = 0; i < response.results.length; i++) {
        const result = response.results[i];
        output += `### ${i + 1}. ${result.title}\n`;
        output += `**URL**: ${result.url}\n`;
        output += `**Source**: ${result.source || 'Unknown'}\n\n`;
        output += `${result.snippet}\n\n`;
        output += '---\n\n';
    }

    if (response.totalResults) {
        output += `*Total results available: ${response.totalResults}*\n`;
    }

    return output;
}
