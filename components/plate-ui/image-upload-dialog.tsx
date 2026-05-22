'use client';

import {
  PlaceholderPlugin,
} from '@platejs/media/react';
import { ImageIcon, LinkIcon, UploadIcon, Loader2, Cloud, HardDrive } from 'lucide-react';
import { isUrl, KEYS } from 'platejs';
import { useEditorRef } from 'platejs/react';
import * as React from 'react';
import { toast } from 'sonner';
import { useFilePicker } from 'use-file-picker';

import { Button } from '@/components/plate-ui/button';
import { getNextFigureId } from '@/components/plate-editor/transforms';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/plate-ui/dialog';
import { Input } from '@/components/plate-ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { browserStorage } from '@/lib/browser-storage';
import { uploadImageToCloud, getApiServiceUrl } from '@/lib/r2-image-upload';
import { useAuth } from '@/components/auth';
import { getAuth } from 'firebase/auth';

interface ImageUploadDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ImageUploadDialog({
  open,
  onOpenChange,
}: ImageUploadDialogProps) {
  const editor = useEditorRef();
  const { user } = useAuth();
  const [url, setUrl] = React.useState('');
  const [tab, setTab] = React.useState<string>('upload');
  const [isUploading, setIsUploading] = React.useState(false);
  const [uploadProgress, setUploadProgress] = React.useState<string>('');

  const cloudEnabled = !!user && !!getApiServiceUrl();

  async function uploadSingleFile(file: File): Promise<string> {
    if (cloudEnabled) {
      // Upload to Cloudflare R2 for authenticated users
      setUploadProgress(`Uploading ${file.name} to cloud...`);
      const idToken = await getAuth().currentUser?.getIdToken();
      if (!idToken) throw new Error('Could not get authentication token.');
      const result = await uploadImageToCloud(file, idToken);
      return result.url;
    } else {
      // Fallback: store locally in IndexedDB
      setUploadProgress(`Compressing ${file.name}...`);
      const imageEntry = await browserStorage.storeImage(file);
      return `indexeddb://images/${imageEntry.id}`;
    }
  }

  const { openFilePicker, errors: filePickerErrors } = useFilePicker({
    accept: ['image/*'],
    multiple: true,
    onFilesSelected: (data: any) => {
      (async () => {
      console.log('[ImageUpload] ===== onFilesSelected called =====');
      console.log('[ImageUpload] Files selected:', data);

      if (filePickerErrors && filePickerErrors.length > 0) {
        console.error('[ImageUpload] File picker errors detected:', filePickerErrors);
        const errorMessages = filePickerErrors.map((err: any) => {
          if (err.fileSizeTooSmall) return `File ${err.fileName} is too small`;
          if (err.fileSizeTooBig) return `File ${err.fileName} is too large (${(err.fileSize / 1024 / 1024).toFixed(2)}MB)`;
          if (err.readerError) return `Error reading ${err.fileName}: ${err.readerError.message}`;
          return `Error with ${err.fileName || 'file'}`;
        });
        toast.error(`File upload errors: ${errorMessages.join(', ')}`);
        return;
      }

      if (!data || !data.plainFiles || data.plainFiles.length === 0) {
        console.warn('[ImageUpload] No files selected or files were rejected');
        toast.error('No files were selected');
        return;
      }

      setIsUploading(true);
      setUploadProgress(`Processing ${data.plainFiles.length} file(s)...`);

      try {
        const results = [];
        const totalFiles = data.plainFiles.length;

        for (let i = 0; i < data.plainFiles.length; i++) {
          const file = data.plainFiles[i] as File;
          try {
            console.log(`[ImageUpload] Processing: ${file.name} (${i + 1}/${totalFiles}), size: ${(file.size / 1024 / 1024).toFixed(2)}MB`);
            setUploadProgress(`Processing ${file.name} (${i + 1}/${totalFiles})...`);

            const imageUrl = await uploadSingleFile(file);

            console.log(`[ImageUpload] Inserting image: ${imageUrl}`);
            setUploadProgress(`Inserting ${file.name}...`);
            editor.tf.insertNodes({
              type: KEYS.img,
              children: [{ text: '' }],
              id: getNextFigureId(editor),
              url: imageUrl,
              width: 400,
              align: 'center',
            });

            const storageLabel = cloudEnabled ? 'cloud' : 'local storage';
            toast.success(`${file.name} uploaded to ${storageLabel}`);
            results.push({ file: file.name, success: true });
          } catch (e) {
            console.error('[ImageUpload] Failed to process file:', e);
            const errorMessage = e instanceof Error ? e.message : 'Unknown error';
            toast.error(`Failed to upload ${file.name}: ${errorMessage}`);
            results.push({ file: file.name, success: false, error: errorMessage });
          }
        }

        const successCount = results.filter(r => r.success).length;
        if (successCount > 0) {
          onOpenChange(false);
        }
      } catch (error) {
        console.error('[ImageUpload] Fatal error:', error);
        toast.error(`Failed to process files: ${error instanceof Error ? error.message : 'Unknown error'}`);
      } finally {
        setIsUploading(false);
        setUploadProgress('');
      }
      })().catch((unhandledError) => {
        setIsUploading(false);
        setUploadProgress('');
        console.error('[ImageUpload] Unhandled error:', unhandledError);
        toast.error('An unexpected error occurred during upload');
      });
    },
  });

  const handleUrlSubmit = () => {
    if (!isUrl(url)) {
      return toast.error('Invalid URL');
    }

    editor.tf.insertNodes({
      children: [{ text: '' }],
      type: KEYS.img,
      url,
      id: getNextFigureId(editor),
      width: 400,
      align: 'center',
    });

    setUrl('');
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <div className="relative">
          {isUploading && (
            <div className="absolute inset-0 z-50 flex items-center justify-center bg-background/90 backdrop-blur-sm rounded-lg" style={{ margin: '-1.5rem' }}>
              <div className="flex flex-col items-center gap-2">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
                {uploadProgress && (
                  <p className="text-sm text-muted-foreground">{uploadProgress}</p>
                )}
              </div>
            </div>
          )}
          <DialogHeader>
            <DialogTitle>Insert Image</DialogTitle>
          </DialogHeader>
          <Tabs value={tab} onValueChange={setTab} className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="upload" className="flex items-center gap-2">
              <UploadIcon className="size-4" />
              Upload
            </TabsTrigger>
            <TabsTrigger value="url" className="flex items-center gap-2">
              <LinkIcon className="size-4" />
              URL
            </TabsTrigger>
          </TabsList>
          <TabsContent value="upload" className="mt-4">
            <div
              className="flex flex-col items-center justify-center border-2 border-dashed border-muted-foreground/25 rounded-lg p-10 hover:bg-accent cursor-pointer transition-colors"
              onClick={() => openFilePicker()}
            >
              <UploadIcon className="size-8 text-muted-foreground mb-4" />
              <p className="text-sm text-muted-foreground">
                Click to upload or drag and drop
              </p>
              <p className="text-xs text-muted-foreground/50 mt-1">
                PNG, JPG, GIF up to 10MB
              </p>
              <div className="flex items-center gap-1.5 mt-3">
                {cloudEnabled ? (
                  <>
                    <Cloud className="size-3 text-primary/70" />
                    <span className="text-xs text-primary/70">Stored in cloud (accessible anywhere)</span>
                  </>
                ) : (
                  <>
                    <HardDrive className="size-3 text-muted-foreground/50" />
                    <span className="text-xs text-muted-foreground/50">Stored locally (sign in + configure API for cloud)</span>
                  </>
                )}
              </div>
            </div>
          </TabsContent>
          <TabsContent value="url" className="mt-4">
            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-2">
                <Input
                  placeholder="Paste image URL..."
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleUrlSubmit();
                  }}
                  autoFocus
                />
              </div>
              <Button onClick={handleUrlSubmit} disabled={!url}>
                Insert Image
              </Button>
            </div>
          </TabsContent>
        </Tabs>
        </div>
      </DialogContent>
    </Dialog>
  );
}
