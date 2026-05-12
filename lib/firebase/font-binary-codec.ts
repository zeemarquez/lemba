/**
 * Encode/decode font blobs for Firestore (base64 payload).
 */

export function blobToBase64(blob: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => {
            const dataUrl = reader.result as string;
            const comma = dataUrl.indexOf(',');
            resolve(comma >= 0 ? dataUrl.slice(comma + 1) : dataUrl);
        };
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(blob);
    });
}

export function base64ToBlob(base64: string, mimeType: string): Blob {
    const binary = atob(base64);
    const len = binary.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
        bytes[i] = binary.charCodeAt(i);
    }
    return new Blob([bytes], { type: mimeType });
}

export function mimeTypeForFontFormat(format: string): string {
    switch (format) {
        case 'woff2':
            return 'font/woff2';
        case 'woff':
            return 'font/woff';
        case 'opentype':
            return 'font/otf';
        case 'truetype':
        default:
            return 'font/ttf';
    }
}
