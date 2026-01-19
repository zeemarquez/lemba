'use client';

import * as React from 'react';
import { browserStorage } from '@/lib/browser-storage';

// Cache for blob URLs to avoid recreating them
const blobUrlCache = new Map<string, string>();

/**
 * Check if a URL is an IndexedDB image URL
 */
export function isIndexedDbUrl(url: string | undefined): boolean {
  return !!url && url.startsWith('indexeddb://images/');
}

/**
 * Extract the image ID from an IndexedDB URL
 */
export function getImageIdFromUrl(url: string): string | null {
  const match = url.match(/^indexeddb:\/\/images\/(.+)$/);
  return match ? match[1] : null;
}

/**
 * Resolve an IndexedDB URL to a blob URL
 * Returns the original URL if it's not an IndexedDB URL
 */
export async function resolveImageUrl(url: string | undefined): Promise<string | undefined> {
  if (!url) return url;
  
  // If it's not an IndexedDB URL, return as-is
  if (!isIndexedDbUrl(url)) {
    return url;
  }
  
  // Check cache first
  if (blobUrlCache.has(url)) {
    return blobUrlCache.get(url);
  }
  
  const imageId = getImageIdFromUrl(url);
  if (!imageId) return url;
  
  try {
    const blobUrl = await browserStorage.getImageUrl(imageId);
    if (blobUrl) {
      blobUrlCache.set(url, blobUrl);
      return blobUrl;
    }
  } catch (e) {
    console.error('Failed to resolve IndexedDB image URL:', e);
  }
  
  return url;
}

/**
 * Hook to resolve an image URL, handling IndexedDB URLs
 * @param url The image URL (may be indexeddb:// or regular URL)
 * @returns The resolved blob URL for display
 */
export function useIndexedDbImage(url: string | undefined): {
  resolvedUrl: string | undefined;
  isLoading: boolean;
  error: Error | null;
} {
  const [resolvedUrl, setResolvedUrl] = React.useState<string | undefined>(
    // If not an IndexedDB URL, use it directly
    url && !isIndexedDbUrl(url) ? url : undefined
  );
  const [isLoading, setIsLoading] = React.useState(isIndexedDbUrl(url));
  const [error, setError] = React.useState<Error | null>(null);

  React.useEffect(() => {
    if (!url) {
      setResolvedUrl(undefined);
      setIsLoading(false);
      return;
    }

    // If it's not an IndexedDB URL, use it directly
    if (!isIndexedDbUrl(url)) {
      setResolvedUrl(url);
      setIsLoading(false);
      return;
    }

    // Check cache first
    if (blobUrlCache.has(url)) {
      setResolvedUrl(blobUrlCache.get(url));
      setIsLoading(false);
      return;
    }

    // Resolve IndexedDB URL
    setIsLoading(true);
    setError(null);

    resolveImageUrl(url)
      .then((resolved) => {
        setResolvedUrl(resolved);
        setIsLoading(false);
      })
      .catch((e) => {
        console.error('Failed to resolve IndexedDB image:', e);
        setError(e);
        setIsLoading(false);
      });
  }, [url]);

  return { resolvedUrl, isLoading, error };
}

/**
 * Clean up blob URLs when they're no longer needed
 * Call this when unmounting components or cleaning up
 */
export function revokeBlobUrl(indexedDbUrl: string): void {
  const blobUrl = blobUrlCache.get(indexedDbUrl);
  if (blobUrl) {
    URL.revokeObjectURL(blobUrl);
    blobUrlCache.delete(indexedDbUrl);
  }
}

/**
 * Clear all cached blob URLs
 */
export function clearBlobUrlCache(): void {
  blobUrlCache.forEach((blobUrl) => {
    URL.revokeObjectURL(blobUrl);
  });
  blobUrlCache.clear();
}

/**
 * Resolve all IndexedDB image URLs in an HTML string
 * Used for PDF preview/export where we need to pre-resolve all images
 * @param html The HTML string containing potential indexeddb:// URLs
 * @returns The HTML with all IndexedDB URLs replaced with blob URLs
 */
export async function resolveIndexedDbImagesInHtml(html: string): Promise<string> {
  // Find all indexeddb:// URLs in the HTML
  const urlRegex = /indexeddb:\/\/images\/[^"'\s)]+/g;
  const matches = html.match(urlRegex);
  
  if (!matches) return html;
  
  // Get unique URLs
  const uniqueUrls = [...new Set(matches)];
  
  // Resolve all URLs in parallel
  const resolutions = await Promise.all(
    uniqueUrls.map(async (url) => {
      const resolved = await resolveImageUrl(url);
      return { original: url, resolved: resolved || url };
    })
  );
  
  // Replace all URLs in the HTML
  let result = html;
  for (const { original, resolved } of resolutions) {
    // Use a global regex for each URL to replace all occurrences
    result = result.split(original).join(resolved);
  }
  
  return result;
}

/**
 * Convert a blob URL or IndexedDB URL to a base64 data URL
 * This is needed for PDF export since the server can't access blob URLs
 */
async function blobToBase64(blobUrl: string): Promise<string> {
  const response = await fetch(blobUrl);
  const blob = await response.blob();
  
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

/**
 * Convert all IndexedDB image URLs in markdown to base64 data URLs
 * Used before sending content to server for PDF export
 * @param markdown The markdown string containing potential indexeddb:// URLs
 * @returns The markdown with all IndexedDB URLs replaced with base64 data URLs
 */
export async function convertIndexedDbImagesToBase64(markdown: string): Promise<string> {
  // Find all indexeddb:// URLs in the markdown
  const urlRegex = /indexeddb:\/\/images\/[^"'\s)]+/g;
  const matches = markdown.match(urlRegex);
  
  if (!matches) return markdown;
  
  // Get unique URLs
  const uniqueUrls = [...new Set(matches)];
  
  // Resolve and convert all URLs to base64 in parallel
  const resolutions = await Promise.all(
    uniqueUrls.map(async (indexedDbUrl) => {
      try {
        // First resolve to blob URL
        const blobUrl = await resolveImageUrl(indexedDbUrl);
        if (!blobUrl || blobUrl === indexedDbUrl) {
          return { original: indexedDbUrl, resolved: indexedDbUrl };
        }
        
        // Convert blob URL to base64
        const base64 = await blobToBase64(blobUrl);
        return { original: indexedDbUrl, resolved: base64 };
      } catch (e) {
        console.error('Failed to convert image to base64:', e);
        return { original: indexedDbUrl, resolved: indexedDbUrl };
      }
    })
  );
  
  // Replace all URLs in the markdown
  let result = markdown;
  for (const { original, resolved } of resolutions) {
    result = result.split(original).join(resolved);
  }
  
  return result;
}
