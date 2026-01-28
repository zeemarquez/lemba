'use client';

import {
  PlaceholderPlugin,
} from '@platejs/media/react';
import { ImageIcon, LinkIcon, UploadIcon, Loader2 } from 'lucide-react';
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

interface ImageUploadDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ImageUploadDialog({
  open,
  onOpenChange,
}: ImageUploadDialogProps) {
  const editor = useEditorRef();
  const [url, setUrl] = React.useState('');
  const [tab, setTab] = React.useState<string>('upload');
  const [isUploading, setIsUploading] = React.useState(false);
  const [uploadProgress, setUploadProgress] = React.useState<string>('');

  const { openFilePicker, errors: filePickerErrors } = useFilePicker({
    accept: ['image/*'],
    multiple: true,
    onFilesSelected: (data: any) => {
      // Wrap in async IIFE to handle async operations properly
      (async () => {
      console.log('[ImageUpload] ===== onFilesSelected called =====');
      console.log('[ImageUpload] Files selected:', data);
      console.log('[ImageUpload] Data type:', typeof data);
      console.log('[ImageUpload] Data keys:', data ? Object.keys(data) : 'null');
      console.log('[ImageUpload] plainFiles:', data?.plainFiles);
      console.log('[ImageUpload] plainFiles length:', data?.plainFiles?.length);
      console.log('[ImageUpload] File picker errors:', filePickerErrors);
      
      // Check for errors from file picker
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
        if (filePickerErrors && filePickerErrors.length > 0) {
          toast.error('Files were rejected. Please check file size and type.');
        } else {
          toast.error('No files were selected');
        }
        return;
      }
      
      // Always use manual insertion for ImageUploadDialog to ensure proper error handling
      // PlaceholderPlugin path can fail silently for large files
      console.log(`[ImageUpload] Processing ${data.plainFiles.length} file(s) manually`);
      
      setIsUploading(true);
      setUploadProgress(`Processing ${data.plainFiles.length} file(s)...`);
      
      try {
        // Process files sequentially to avoid overwhelming the browser
        const results = [];
        const totalFiles = data.plainFiles.length;
        
        for (let i = 0; i < data.plainFiles.length; i++) {
          const file = data.plainFiles[i] as File;
          try {
            console.log(`[ImageUpload] Starting processing: ${file.name}, size: ${(file.size / 1024 / 1024).toFixed(2)}MB, type: ${file.type}`);
            setUploadProgress(`Processing ${file.name} (${i + 1}/${totalFiles})...`);
            
            try {
              console.log(`[ImageUpload] Step 1: Calling browserStorage.storeImage for: ${file.name}`);
              setUploadProgress(`Compressing ${file.name}...`);
              const startTime = Date.now();
              const imageEntry = await browserStorage.storeImage(file);
              const duration = Date.now() - startTime;
              console.log(`[ImageUpload] Step 1 complete: Image stored in ${duration}ms, ID: ${imageEntry.id}`);
              
              const imageUrl = `indexeddb://images/${imageEntry.id}`;
              console.log(`[ImageUpload] Step 2: Image URL created: ${imageUrl}`);
              
              console.log(`[ImageUpload] Step 3: Inserting image node into editor`);
              setUploadProgress(`Inserting ${file.name}...`);
              editor.tf.insertNodes({
                type: KEYS.img,
                children: [{ text: '' }],
                id: getNextFigureId(editor),
                url: imageUrl,
                width: 400,
                align: 'center',
              });
              console.log(`[ImageUpload] Step 3 complete: Image node inserted`);
              
              toast.success(`Image ${file.name} uploaded successfully`);
              console.log(`[ImageUpload] ✅ Successfully uploaded and inserted image: ${file.name}`);
              results.push({ file: file.name, success: true });
            } catch (storageError) {
              console.error('[ImageUpload] ❌ Storage error details:', storageError);
              console.error('[ImageUpload] Storage error stack:', storageError instanceof Error ? storageError.stack : 'No stack');
              throw storageError;
            }
          } catch (e) {
            console.error('[ImageUpload] ❌ Failed to store image:', e);
            console.error('[ImageUpload] Error stack:', e instanceof Error ? e.stack : 'No stack trace');
            const errorMessage = e instanceof Error ? e.message : 'Unknown error';
            toast.error(`Failed to upload image ${file.name}: ${errorMessage}`);
            results.push({ file: file.name, success: false, error: errorMessage });
          }
        }
        
        const successCount = results.filter(r => r.success).length;
        const failCount = results.filter(r => !r.success).length;
        console.log(`[ImageUpload] Processing complete: ${successCount} succeeded, ${failCount} failed`);
        
        setIsUploading(false);
        setUploadProgress('');
        
        if (successCount > 0) {
          onOpenChange(false);
        }
      } catch (error) {
        setIsUploading(false);
        setUploadProgress('');
        console.error('[ImageUpload] ❌ Fatal error in onFilesSelected:', error);
        console.error('[ImageUpload] Fatal error stack:', error instanceof Error ? error.stack : 'No stack');
        toast.error(`Failed to process files: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
      })().catch((unhandledError) => {
        // Catch any unhandled promise rejections from the async IIFE
        setIsUploading(false);
        setUploadProgress('');
        console.error('[ImageUpload] ❌ Unhandled error:', unhandledError);
        toast.error('An unexpected error occurred during upload');
      }); // End async IIFE
    },
  });

  const handleUrlSubmit = () => {
    if (!isUrl(url)) {
      return toast.error('Invalid URL');
    }

    // Insert image node with auto-assigned fig-X ID
    editor.tf.insertNodes({
      children: [{ text: '' }],
      type: KEYS.img,
      url,
      id: getNextFigureId(editor),
      width: 400, // Default width to enable HTML serialization
      align: 'center', // Default alignment
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
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
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
