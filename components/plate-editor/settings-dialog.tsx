'use client';

/* DEMO ONLY, DO NOT USE IN PRODUCTION */

import {
  Monitor,
  Moon,
  Settings,
  Sun,
} from 'lucide-react';
import { useTheme } from 'next-themes';
import * as React from 'react';

import { Button } from '@/components/plate-ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/plate-ui/dialog';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui/tabs';
import { Input } from '@/components/plate-ui/input';
import { useStore } from '@/lib/store';
import { cn } from '@/lib/utils';
import { useEffect, useState } from 'react';

export function SettingsDialog() {
  const { theme, setTheme } = useTheme();
  const { 
    isSettingsOpen: open, 
    setSettingsOpen: setOpen,
    storagePath,
    fetchStoragePath,
    updateStoragePath
  } = useStore();

  const [localPath, setLocalPath] = useState('');

  useEffect(() => {
    if (open) {
      fetchStoragePath();
    }
  }, [open, fetchStoragePath]);

  useEffect(() => {
    setLocalPath(storagePath);
  }, [storagePath]);

  const handleSavePath = async () => {
    await updateStoragePath(localPath);
    // Optionally show toast or feedback
  };

  return (
    <Dialog onOpenChange={setOpen} open={open}>
      <DialogTrigger asChild>
        <Button
          className={cn(
            'group fixed right-4 bottom-4 z-50 size-10 overflow-hidden',
            'rounded-full shadow-md hover:shadow-lg'
          )}
          size="icon"
          variant="default"
        >
          <Settings className="size-4" />
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl p-0 overflow-hidden gap-0 flex flex-col min-h-[400px]">
        <DialogHeader className="p-6 pb-2 border-b">
          <DialogTitle className="text-xl">Settings</DialogTitle>
          <DialogDescription>
            Configure your preferences.
          </DialogDescription>
        </DialogHeader>

        <Tabs className="flex flex-1" defaultValue="general">
          <TabsList className="flex h-full w-48 flex-col items-stretch justify-start rounded-none border-r bg-muted/20 p-2 gap-1">
            <TabsTrigger
              className="justify-start px-4 py-2 data-[state=active]:bg-background data-[state=active]:shadow-none border-none"
              value="general"
            >
              General
            </TabsTrigger>
            <TabsTrigger
              className="justify-start px-4 py-2 data-[state=active]:bg-background data-[state=active]:shadow-none border-none"
              value="storage"
            >
              Storage
            </TabsTrigger>
          </TabsList>

          <div className="flex-1 p-6">
            <TabsContent className="mt-0 outline-none" value="general">
              <div className="space-y-6">
                <div className="space-y-4">
                  <h4 className="font-medium text-sm">Appearance</h4>
                  <div className="grid grid-cols-3 gap-4">
                    <Button
                      className="flex flex-col items-center justify-center gap-2 h-24 p-0"
                      onClick={() => setTheme('light')}
                      variant={theme === 'light' ? 'secondary' : 'outline'}
                    >
                      <Sun className="size-6" />
                      <span className="text-xs">Light</span>
                    </Button>
                    <Button
                      className="flex flex-col items-center justify-center gap-2 h-24 p-0"
                      onClick={() => setTheme('dark')}
                      variant={theme === 'dark' ? 'secondary' : 'outline'}
                    >
                      <Moon className="size-6" />
                      <span className="text-xs">Dark</span>
                    </Button>
                    <Button
                      className="flex flex-col items-center justify-center gap-2 h-24 p-0"
                      onClick={() => setTheme('system')}
                      variant={theme === 'system' ? 'secondary' : 'outline'}
                    >
                      <Monitor className="size-6" />
                      <span className="text-xs">System</span>
                    </Button>
                  </div>
                </div>
              </div>
            </TabsContent>

            <TabsContent className="mt-0 outline-none" value="storage">
              <div className="space-y-6">
                 <div className="space-y-4">
                    <h4 className="font-medium text-sm">Local Storage</h4>
                    <div className="space-y-2">
                        <label className="text-xs text-muted-foreground">Storage Path (absolute path)</label>
                        <div className="flex gap-2">
                            <Input 
                                value={localPath} 
                                onChange={(e) => setLocalPath(e.target.value)} 
                                placeholder="/path/to/folder" 
                            />
                            <Button onClick={handleSavePath}>Save</Button>
                        </div>
                        <p className="text-[10px] text-muted-foreground">
                            Default: ~/Documents/MarkdownEditor. 
                            The app will create "Files" and "Templates" folders here.
                        </p>
                    </div>
                 </div>
              </div>
            </TabsContent>
          </div>
        </Tabs>

        <div className="p-4 border-t bg-muted/5">
          <p className="text-muted-foreground text-[10px] text-center uppercase tracking-wider font-medium">
            Settings are saved for the current session
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
