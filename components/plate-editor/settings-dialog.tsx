'use client';

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
import { useStore } from '@/lib/store';
import { cn } from '@/lib/utils';

export function SettingsDialog() {
  const { theme, setTheme } = useTheme();
  const { 
    isSettingsOpen: open, 
    setSettingsOpen: setOpen,
  } = useStore();

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
      <DialogContent className="sm:max-w-5xl p-0 overflow-hidden gap-0 flex flex-col min-h-[600px]">
        <DialogHeader className="p-6 pb-2 border-b">
          <DialogTitle className="text-xl">Settings</DialogTitle>
          <DialogDescription>
            Configure your preferences.
          </DialogDescription>
        </DialogHeader>

        <Tabs className="flex-row gap-0 flex-1 items-stretch" defaultValue="general">
          <TabsList className="flex h-auto w-48 flex-col items-stretch justify-start rounded-none border-r bg-muted/20 p-2 gap-1">
            <TabsTrigger
              className="w-full justify-start px-4 py-2 h-9 flex-none data-[state=active]:bg-background data-[state=active]:shadow-none border-none"
              value="general"
            >
              General
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
          </div>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
