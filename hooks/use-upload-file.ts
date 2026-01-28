import { generateReactHelpers } from '@uploadthing/react';
import * as React from 'react';
import { toast } from 'sonner';
import type {
  ClientUploadedFileData,
  UploadFilesOptions,
} from 'uploadthing/types';
import { z } from 'zod';
import type { OurFileRouter } from '@/lib/plate/uploadthing';
import { browserStorage } from '@/lib/browser-storage';
import { compressImage } from '@/lib/image-compression';

export type UploadedFile<T = unknown> = ClientUploadedFileData<T>;

interface UseUploadFileProps
  extends Pick<
    UploadFilesOptions<OurFileRouter['editorUploader']>,
    'headers' | 'onUploadBegin' | 'onUploadProgress' | 'skipPolling'
  > {
  onUploadComplete?: (file: UploadedFile) => void;
  onUploadError?: (error: unknown) => void;
}

export function useUploadFile({
  onUploadComplete,
  onUploadError,
  ...props
}: UseUploadFileProps = {}) {
  const [uploadedFile, setUploadedFile] = React.useState<UploadedFile>();
  const [uploadingFile, setUploadingFile] = React.useState<File>();
  const [progress, setProgress] = React.useState<number>(0);
  const [isUploading, setIsUploading] = React.useState(false);

  async function uploadThing(file: File) {
    setIsUploading(true);
    setUploadingFile(file);

    try {
      // Compress image if it's over 500KB before uploading
      // Compression will return original file if it fails, so this is safe
      let compressedFile: File;
      try {
        compressedFile = await compressImage(file, 500 * 1024);
      } catch (compressionError) {
        console.warn('Compression failed, using original file:', compressionError);
        compressedFile = file;
      }
      
      const res = await uploadFiles('editorUploader', {
        ...props,
        files: [compressedFile],
        onUploadProgress: ({ progress }) => {
          setProgress(Math.min(progress, 100));
        },
      });

      setUploadedFile(res[0]);

      onUploadComplete?.(res[0]);

      return uploadedFile;
    } catch (error) {
      const errorMessage = getErrorMessage(error);

      const message =
        errorMessage.length > 0
          ? errorMessage
          : 'Something went wrong, please try again later.';

      toast.error(message);

      onUploadError?.(error);

      // Store image locally in IndexedDB for persistence
      // This ensures images survive page refreshes and browser restarts
      // Try to compress, but use original if compression fails
      let compressedFile: File;
      try {
        compressedFile = await compressImage(file, 500 * 1024);
      } catch (compressionError) {
        console.warn('Compression failed in fallback, using original file:', compressionError);
        compressedFile = file;
      }
      
      let progress = 0;

      const simulateProgress = async () => {
        while (progress < 100) {
          await new Promise((resolve) => setTimeout(resolve, 50));
          progress += 4; // Faster progress since local storage is quick
          setProgress(Math.min(progress, 100));
        }
      };

      // Start progress simulation
      const progressPromise = simulateProgress();

      // Store image in IndexedDB (will try to compress again, but storeImage handles failures)
      try {
        const imageEntry = await browserStorage.storeImage(compressedFile);
        
        // Wait for progress to complete for smooth UX
        await progressPromise;

        // Create URL using our custom protocol that will be resolved later
        // Format: indexeddb://images/{id}
        const persistentUrl = `indexeddb://images/${imageEntry.id}`;

        const localUploadedFile = {
          key: imageEntry.id,
          appUrl: persistentUrl,
          name: compressedFile.name,
          size: compressedFile.size,
          type: compressedFile.type,
          url: persistentUrl,
        } as UploadedFile;

        setUploadedFile(localUploadedFile);

        return localUploadedFile;
      } catch (storageError) {
        console.error('Failed to store image in IndexedDB:', storageError);
        toast.error('Failed to store image locally');
        throw storageError;
      }
    } finally {
      setProgress(0);
      setIsUploading(false);
      setUploadingFile(undefined);
    }
  }

  return {
    isUploading,
    progress,
    uploadedFile,
    uploadFile: uploadThing,
    uploadingFile,
  };
}

export const { uploadFiles, useUploadThing } =
  generateReactHelpers<OurFileRouter>();

export function getErrorMessage(err: unknown) {
  const unknownError = 'Something went wrong, please try again later.';

  if (err instanceof z.ZodError) {
    const errors = err.issues.map((issue) => issue.message);

    return errors.join('\n');
  }
  if (err instanceof Error) {
    return err.message;
  }
  return unknownError;
}

export function showErrorToast(err: unknown) {
  const errorMessage = getErrorMessage(err);

  return toast.error(errorMessage);
}
