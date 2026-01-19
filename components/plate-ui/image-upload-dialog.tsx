'use client';

import {
  PlaceholderPlugin,
} from '@platejs/media/react';
import { ImageIcon, LinkIcon, UploadIcon } from 'lucide-react';
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

  const { openFilePicker } = useFilePicker({
    accept: ['image/*'],
    multiple: true,
    onFilesSelected: async (data: any) => {
      if (data.plainFiles && data.plainFiles.length > 0) {
        // Try to use the PlaceholderPlugin's insert.media if available
        try {
          const transforms = editor.getTransforms(PlaceholderPlugin);
          if (transforms?.insert?.media) {
            transforms.insert.media(data.plainFiles);
            onOpenChange(false);
            return;
          }
        } catch {
          // PlaceholderPlugin not available, fall through to manual insertion
        }
        
        // Fallback: manually store images and insert nodes
        // This is used when PlaceholderPlugin is not configured (e.g., header/footer editor)
        for (const file of data.plainFiles as File[]) {
          try {
            const imageEntry = await browserStorage.storeImage(file);
            const imageUrl = `indexeddb://images/${imageEntry.id}`;
            
            editor.tf.insertNodes({
              type: KEYS.img,
              children: [{ text: '' }],
              id: getNextFigureId(editor),
              url: imageUrl,
              width: 400,
              align: 'center',
            });
          } catch (e) {
            console.error('Failed to store image:', e);
            toast.error('Failed to upload image');
          }
        }
        onOpenChange(false);
      }
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
      </DialogContent>
    </Dialog>
  );
}
