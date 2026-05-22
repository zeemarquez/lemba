/**
 * Upload an image to Cloudflare R2 via the API service.
 *
 * Authentication uses a Firebase ID token so no separate API key is needed
 * by the user — their existing Firebase session is enough.
 *
 * Requires NEXT_PUBLIC_API_SERVICE_URL to be set.
 */

import { compressImage } from './image-compression';

const MAX_R2_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB

export interface R2UploadResult {
    imageId: string;
    url: string;
    filename: string;
    size: number;
    contentType: string;
}

/**
 * Returns the configured API service base URL (no trailing slash), or null if unset.
 */
export function getApiServiceUrl(): string | null {
    const url =
        (typeof process !== 'undefined' && process.env.NEXT_PUBLIC_API_SERVICE_URL) || '';
    return url.trim() ? url.replace(/\/$/, '') : null;
}

/**
 * Upload a single image file to R2.
 *
 * @param file      The image file to upload (compressed client-side to ≤ 10 MB).
 * @param idToken   Firebase ID token for the authenticated user.
 * @returns         The public R2 URL and metadata for the stored image.
 */
export async function uploadImageToCloud(
    file: File,
    idToken: string,
): Promise<R2UploadResult> {
    const apiUrl = getApiServiceUrl();
    if (!apiUrl) {
        throw new Error(
            'API service URL is not configured. Set NEXT_PUBLIC_API_SERVICE_URL in your environment.',
        );
    }

    // Client-side compression to stay under 10 MB
    let fileToUpload: File;
    try {
        fileToUpload = await compressImage(file, MAX_R2_SIZE_BYTES);
    } catch {
        fileToUpload = file;
    }

    if (fileToUpload.size > MAX_R2_SIZE_BYTES) {
        throw new Error(
            `Image is too large (${(fileToUpload.size / 1024 / 1024).toFixed(1)} MB). Maximum allowed size is 10 MB.`,
        );
    }

    const formData = new FormData();
    formData.append('image', fileToUpload, fileToUpload.name);

    const response = await fetch(`${apiUrl}/v1/me/images/upload`, {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${idToken}`,
        },
        body: formData,
    });

    if (!response.ok) {
        let message = `Upload failed (HTTP ${response.status})`;
        try {
            const body = (await response.json()) as { message?: string };
            if (body.message) message = body.message;
        } catch {
            /* ignore */
        }
        throw new Error(message);
    }

    return response.json() as Promise<R2UploadResult>;
}
