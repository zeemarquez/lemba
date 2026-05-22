/**
 * Cloudflare R2 storage for user-uploaded images.
 *
 * R2 is S3-compatible. The AWS SDK S3Client points at the R2 endpoint.
 *
 * Required env vars:
 *   CLOUDFLARE_R2_ACCOUNT_ID        - Cloudflare account ID
 *   CLOUDFLARE_R2_ACCESS_KEY_ID     - R2 API token access key ID
 *   CLOUDFLARE_R2_SECRET_ACCESS_KEY - R2 API token secret access key
 *   CLOUDFLARE_R2_BUCKET_NAME       - Bucket name (e.g. "lemba-images")
 *   CLOUDFLARE_R2_PUBLIC_URL        - Public base URL (e.g. "https://pub-xxx.r2.dev")
 */

import {
    S3Client,
    PutObjectCommand,
    DeleteObjectCommand,
    ListObjectsV2Command,
    type ListObjectsV2CommandOutput,
} from '@aws-sdk/client-s3';

function getR2Client(): S3Client | null {
    const accountId = process.env.CLOUDFLARE_R2_ACCOUNT_ID;
    const accessKeyId = process.env.CLOUDFLARE_R2_ACCESS_KEY_ID;
    const secretAccessKey = process.env.CLOUDFLARE_R2_SECRET_ACCESS_KEY;

    if (!accountId || !accessKeyId || !secretAccessKey) return null;

    return new S3Client({
        region: 'auto',
        endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
        credentials: { accessKeyId, secretAccessKey },
    });
}

export function isR2Configured(): boolean {
    return !!(
        process.env.CLOUDFLARE_R2_ACCOUNT_ID &&
        process.env.CLOUDFLARE_R2_ACCESS_KEY_ID &&
        process.env.CLOUDFLARE_R2_SECRET_ACCESS_KEY &&
        process.env.CLOUDFLARE_R2_BUCKET_NAME &&
        process.env.CLOUDFLARE_R2_PUBLIC_URL
    );
}

function getBucketName(): string {
    return process.env.CLOUDFLARE_R2_BUCKET_NAME || '';
}

/** Returns the public HTTPS URL for a given R2 object key. */
export function getR2PublicUrl(key: string): string {
    const base = (process.env.CLOUDFLARE_R2_PUBLIC_URL || '').replace(/\/$/, '');
    return `${base}/${key}`;
}

/** Object key for a user image: images/{userId}/{imageId}.{ext} */
export function buildImageKey(userId: string, imageId: string, ext: string): string {
    const safeExt = ext.replace(/^\./, '');
    return `images/${userId}/${imageId}.${safeExt}`;
}

export interface UploadImageResult {
    key: string;
    url: string;
}

/**
 * Upload a Buffer to R2.
 * Returns the public URL of the stored image.
 */
export async function uploadImageToR2(
    userId: string,
    imageId: string,
    ext: string,
    buffer: Buffer,
    contentType: string,
): Promise<UploadImageResult> {
    const client = getR2Client();
    if (!client) throw new Error('R2 is not configured.');

    const key = buildImageKey(userId, imageId, ext);
    const bucket = getBucketName();

    await client.send(
        new PutObjectCommand({
            Bucket: bucket,
            Key: key,
            Body: buffer,
            ContentType: contentType,
        }),
    );

    return { key, url: getR2PublicUrl(key) };
}

/** Delete a single image from R2 by key. */
export async function deleteImageFromR2(key: string): Promise<void> {
    const client = getR2Client();
    if (!client) throw new Error('R2 is not configured.');

    await client.send(
        new DeleteObjectCommand({
            Bucket: getBucketName(),
            Key: key,
        }),
    );
}

export interface CloudImageEntry {
    key: string;
    url: string;
    imageId: string;
    filename: string;
    size: number;
    lastModified: string;
}

/** List all images stored in R2 for a given user. */
export async function listUserImagesFromR2(userId: string): Promise<CloudImageEntry[]> {
    const client = getR2Client();
    if (!client) throw new Error('R2 is not configured.');

    const prefix = `images/${userId}/`;
    const results: CloudImageEntry[] = [];
    let continuationToken: string | undefined;

    do {
        const res: ListObjectsV2CommandOutput = await client.send(
            new ListObjectsV2Command({
                Bucket: getBucketName(),
                Prefix: prefix,
                ContinuationToken: continuationToken,
            }),
        );

        for (const obj of res.Contents ?? []) {
            if (!obj.Key) continue;
            const filename = obj.Key.split('/').pop() || obj.Key;
            const dotIdx = filename.lastIndexOf('.');
            const imageId = dotIdx > 0 ? filename.slice(0, dotIdx) : filename;
            results.push({
                key: obj.Key,
                url: getR2PublicUrl(obj.Key),
                imageId,
                filename,
                size: obj.Size ?? 0,
                lastModified: obj.LastModified?.toISOString() ?? '',
            });
        }

        continuationToken = res.NextContinuationToken;
    } while (continuationToken);

    return results.sort((a, b) => b.lastModified.localeCompare(a.lastModified));
}
