'use client';

import {
  Monitor,
  Moon,
  Settings,
  Sun,
  Upload,
  Trash2,
} from 'lucide-react';
import { useTheme } from 'next-themes';
import * as React from 'react';

import { Button } from '@/components/plate-ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
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

export function SettingsDialog() {
  const { theme, setTheme } = useTheme();
  const { 
    isSettingsOpen: open, 
    setSettingsOpen: setOpen,
    previewQuality,
    setPreviewQuality,
    uiIconSize,
    setUiIconSize,
    uiFontSize,
    setUiFontSize,
    customFonts,
    addFont,
    deleteFont,
  } = useStore();

  const [fontFamilyName, setFontFamilyName] = React.useState('');
  const [selectedFile, setSelectedFile] = React.useState<File | null>(null);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setSelectedFile(file);
      // Auto-assign font name from filename if name is empty or unchanged
      const nameWithoutExt = file.name.split('.').slice(0, -1).join('.');
      // Simple heuristic: capitalize first letter, replace hyphens/underscores with spaces
      const formattedName = nameWithoutExt
        .replace(/[-_]/g, ' ')
        .replace(/\b\w/g, c => c.toUpperCase());
      
      setFontFamilyName(formattedName);
    } else {
      setSelectedFile(null);
    }
  };

  const handleFontUpload = async () => {
    if (!selectedFile || !fontFamilyName) return;

    await addFont(fontFamilyName, selectedFile);
    setSelectedFile(null);
    setFontFamilyName('');
    if (fileInputRef.current) fileInputRef.current.value = '';
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
            <TabsTrigger
              className="w-full justify-start px-4 py-2 h-9 flex-none data-[state=active]:bg-background data-[state=active]:shadow-none border-none"
              value="export"
            >
              Export
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

                  <div className="space-y-3 pt-4">
                    <p className="text-sm text-muted-foreground">Icon Size</p>
                    <div className="flex items-center gap-2">
                      <Button
                        size="sm"
                        variant={uiIconSize === 'small' ? 'secondary' : 'outline'}
                        onClick={() => setUiIconSize('small')}
                        className="flex-1"
                      >
                        Small
                      </Button>
                      <Button
                        size="sm"
                        variant={uiIconSize === 'normal' ? 'secondary' : 'outline'}
                        onClick={() => setUiIconSize('normal')}
                        className="flex-1"
                      >
                        Normal
                      </Button>
                      <Button
                        size="sm"
                        variant={uiIconSize === 'big' ? 'secondary' : 'outline'}
                        onClick={() => setUiIconSize('big')}
                        className="flex-1"
                      >
                        Big
                      </Button>
                    </div>
                  </div>

                  <div className="space-y-3 pt-4">
                    <p className="text-sm text-muted-foreground">Font Size</p>
                    <div className="flex items-center gap-2">
                      <Button
                        size="sm"
                        variant={uiFontSize === 'small' ? 'secondary' : 'outline'}
                        onClick={() => setUiFontSize('small')}
                        className="flex-1"
                      >
                        Small
                      </Button>
                      <Button
                        size="sm"
                        variant={uiFontSize === 'normal' ? 'secondary' : 'outline'}
                        onClick={() => setUiFontSize('normal')}
                        className="flex-1"
                      >
                        Normal
                      </Button>
                      <Button
                        size="sm"
                        variant={uiFontSize === 'big' ? 'secondary' : 'outline'}
                        onClick={() => setUiFontSize('big')}
                        className="flex-1"
                      >
                        Big
                      </Button>
                    </div>
                  </div>
                </div>

                <div className="space-y-4 pt-4 border-t">
                  <h4 className="font-medium text-sm">Custom Fonts</h4>
                  <div className="space-y-4">
                    <div className="flex items-end gap-2">
                      <div className="flex-1 space-y-2">
                        <label className="text-xs text-muted-foreground">Upload Font (ttf, otf, woff, woff2)</label>
                        <Input 
                          type="file" 
                          accept=".ttf,.otf,.woff,.woff2"
                          ref={fileInputRef}
                          onChange={handleFileChange}
                          className="w-full cursor-pointer file:cursor-pointer"
                        />
                      </div>
                      <Button 
                        onClick={handleFontUpload} 
                        disabled={!selectedFile || !fontFamilyName}
                        size="icon"
                        className="shrink-0"
                      >
                        <Upload className="size-4" />
                      </Button>
                    </div>

                    {customFonts.length > 0 && (
                      <div className="rounded-md border bg-muted/20 divide-y">
                        {customFonts.map((font) => (
                          <div key={font.id} className="flex items-center justify-between p-3">
                            <div className="flex flex-col">
                              <span className="text-sm font-medium" style={{ fontFamily: font.family }}>
                                {font.family}
                              </span>
                              <span className="text-[10px] text-muted-foreground">
                                {font.fileName} ({font.format})
                              </span>
                            </div>
                            <Button 
                              variant="ghost" 
                              size="icon" 
                              onClick={() => deleteFont(font.id)}
                              className="text-destructive hover:text-destructive hover:bg-destructive/10"
                            >
                              <Trash2 className="size-4" />
                            </Button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </TabsContent>

            <TabsContent className="mt-0 outline-none" value="export">
              <div className="space-y-6">
                <div className="space-y-4">
                  <h4 className="font-medium text-sm">Preview</h4>
                  <div className="space-y-3">
                    <p className="text-sm text-muted-foreground">Preview quality</p>
                    <div className="flex items-center gap-2">
                      <Button
                        size="sm"
                        variant={previewQuality === 'low' ? 'secondary' : 'outline'}
                        onClick={() => setPreviewQuality('low')}
                        className="flex-1"
                      >
                        Low
                      </Button>
                      <Button
                        size="sm"
                        variant={previewQuality === 'medium' ? 'secondary' : 'outline'}
                        onClick={() => setPreviewQuality('medium')}
                        className="flex-1"
                      >
                        Medium
                      </Button>
                      <Button
                        size="sm"
                        variant={previewQuality === 'high' ? 'secondary' : 'outline'}
                        onClick={() => setPreviewQuality('high')}
                        className="flex-1"
                      >
                        High
                      </Button>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Lower quality renders faster. Final export always uses full quality.
                    </p>
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
