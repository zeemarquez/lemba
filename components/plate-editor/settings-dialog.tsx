'use client';

import {
  Monitor,
  Moon,
  Sun,
  Upload,
  Trash2,
  ChevronDown,
  Brain,
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
} from '@/components/plate-ui/dialog';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Input } from '@/components/plate-ui/input';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/plate-ui/dropdown-menu';
import { useStore } from '@/lib/store';

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
    showOutline,
    setShowOutline,
    customFonts,
    addFont,
    deleteFont,
    sourceEditorFontFamily,
    sourceEditorFontSize,
    setSourceEditorFontFamily,
    setSourceEditorFontSize,
    agentApiKeyOverride,
    setAgentApiKeyOverride,
    agentTemperature,
    setAgentTemperature,
    agentMaxTokens,
    setAgentMaxTokens,
  } = useStore();

  const [isDragging, setIsDragging] = React.useState(false);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const processFiles = async (files: FileList | File[]) => {
    const fileArray = Array.from(files);
    const fontFiles = fileArray.filter(file => 
      file.name.match(/\.(ttf|otf|woff|woff2)$/i)
    );

    // Process all font files in parallel
    await Promise.all(
      fontFiles.map(async (file) => {
        // Auto-assign font name from filename
        const nameWithoutExt = file.name.split('.').slice(0, -1).join('.');
        // Simple heuristic: capitalize first letter, replace hyphens/underscores with spaces
        const formattedName = nameWithoutExt
          .replace(/[-_]/g, ' ')
          .replace(/\b\w/g, c => c.toUpperCase());
        
        // Auto-upload immediately
        await addFont(formattedName, file);
      })
    );
    
    // Reset file input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      processFiles(files);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    const files = e.dataTransfer.files;
    if (files && files.length > 0) {
      processFiles(files);
    }
  };

  return (
    <Dialog onOpenChange={setOpen} open={open}>
      <DialogContent className="sm:max-w-5xl p-0 overflow-hidden gap-0 flex flex-col h-[600px]">
        <DialogHeader className="p-6 pb-2 border-b">
          <DialogTitle className="text-xl">Settings</DialogTitle>
          <DialogDescription>
            Configure your preferences.
          </DialogDescription>
        </DialogHeader>

        <Tabs className="flex-row gap-0 flex-1 items-stretch overflow-hidden min-h-0" defaultValue="general">
          <TabsList className="flex h-auto w-48 flex-col items-stretch justify-start rounded-none border-r bg-muted/20 p-2 gap-1">
            <TabsTrigger
              className="w-full justify-start px-4 py-2 h-9 flex-none data-[state=active]:bg-background data-[state=active]:shadow-none border-none"
              value="general"
            >
              General
            </TabsTrigger>
            <TabsTrigger
              className="w-full justify-start px-4 py-2 h-9 flex-none data-[state=active]:bg-background data-[state=active]:shadow-none border-none"
              value="editor"
            >
              Editor
            </TabsTrigger>
            <TabsTrigger
              className="w-full justify-start px-4 py-2 h-9 flex-none data-[state=active]:bg-background data-[state=active]:shadow-none border-none"
              value="export"
            >
              Export
            </TabsTrigger>
            <TabsTrigger
              className="w-full justify-start px-4 py-2 h-9 flex-none data-[state=active]:bg-background data-[state=active]:shadow-none border-none"
              value="templates"
            >
              Templates
            </TabsTrigger>
            <TabsTrigger
              className="w-full justify-start px-4 py-2 h-9 flex-none data-[state=active]:bg-background data-[state=active]:shadow-none border-none"
              value="agent"
            >
              <Brain className="size-4 mr-2 shrink-0" />
              Agent
            </TabsTrigger>
          </TabsList>

          <ScrollArea className="flex-1 h-full">
            <div className="p-6">
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
                  <h4 className="font-medium text-sm">Layout</h4>
                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <p className="text-sm">Show Outline</p>
                      <p className="text-xs text-muted-foreground">
                        Display document outline in the explorer sidebar
                      </p>
                    </div>
                    <button
                      onClick={() => setShowOutline(!showOutline)}
                      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                        showOutline ? 'bg-primary' : 'bg-muted-foreground/30'
                      }`}
                    >
                      <span
                        className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                          showOutline ? 'translate-x-6' : 'translate-x-1'
                        }`}
                      />
                    </button>
                  </div>
                </div>
              </div>
            </TabsContent>

            <TabsContent className="mt-0 outline-none" value="editor">
              <div className="space-y-6">
                <div className="space-y-4">
                  <h4 className="font-medium text-sm">Source</h4>
                  <p className="text-sm text-muted-foreground">
                    Customize the appearance of the markdown source editor.
                  </p>
                  
                  <div className="flex items-center gap-3 pt-2">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="outline"
                          className="w-64 justify-between"
                          style={{ fontFamily: sourceEditorFontFamily }}
                        >
                          <span className="truncate">{sourceEditorFontFamily}</span>
                          <ChevronDown className="size-4 shrink-0 opacity-50" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent className="w-64">
                        {[
                          { label: 'Monospace (System)', value: 'monospace' },
                          { label: 'JetBrains Mono', value: '"JetBrains Mono", monospace' },
                          { label: 'Fira Code', value: '"Fira Code", monospace' },
                          { label: 'Source Code Pro', value: '"Source Code Pro", monospace' },
                          { label: 'Consolas', value: 'Consolas, monospace' },
                          { label: 'Monaco', value: 'Monaco, monospace' },
                          { label: 'Menlo', value: 'Menlo, monospace' },
                          { label: 'Courier New', value: '"Courier New", monospace' },
                        ].map((font) => (
                          <DropdownMenuItem
                            key={font.value}
                            onClick={() => setSourceEditorFontFamily(font.value)}
                            style={{ fontFamily: font.value }}
                          >
                            {font.label}
                          </DropdownMenuItem>
                        ))}
                      </DropdownMenuContent>
                    </DropdownMenu>

                    <Input
                      type="number"
                      min={10}
                      max={32}
                      value={sourceEditorFontSize}
                      onChange={(e) => setSourceEditorFontSize(Number(e.target.value))}
                      className="w-20"
                    />
                    <span className="text-sm text-muted-foreground">px</span>
                  </div>

                  <div 
                    className="mt-4 p-4 rounded-md border bg-muted/30"
                    style={{ 
                      fontFamily: sourceEditorFontFamily, 
                      fontSize: `${sourceEditorFontSize}px`,
                      lineHeight: 1.5,
                    }}
                  >
                    <pre className="whitespace-pre-wrap text-foreground">
{`# Sample Markdown

The quick brown fox jumps over the lazy dog.

\`\`\`javascript
function hello() {
  console.log("Hello, World!");
}
\`\`\``}
                    </pre>
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

              <TabsContent className="mt-0 outline-none" value="agent">
                <div className="space-y-6">
                  <div className="space-y-4">
                    <h4 className="font-medium text-sm">OpenAI API</h4>
                    <p className="text-sm text-muted-foreground">
                      Configure the AI assistant. Leave the API key empty to use the environment variable (NEXT_PUBLIC_OPENAI_API_KEY or OPENAI_API_KEY).
                    </p>
                    <div className="space-y-2">
                      <label htmlFor="agent-api-key" className="text-sm font-medium">
                        API Key
                      </label>
                      <Input
                        id="agent-api-key"
                        type="password"
                        placeholder="sk-..."
                        value={agentApiKeyOverride}
                        onChange={(e) => setAgentApiKeyOverride(e.target.value)}
                        className="font-mono text-sm"
                        autoComplete="off"
                      />
                    </div>
                  </div>
                  <div className="space-y-4 pt-4 border-t">
                    <h4 className="font-medium text-sm">Model parameters</h4>
                    <div className="grid gap-4 sm:grid-cols-2">
                      <div className="space-y-2">
                        <label htmlFor="agent-temperature" className="text-sm font-medium">
                          Temperature
                        </label>
                        <Input
                          id="agent-temperature"
                          type="number"
                          min={0}
                          max={2}
                          step={0.1}
                          value={agentTemperature}
                          onChange={(e) => setAgentTemperature(Number(e.target.value) || 0.7)}
                          className="w-full"
                        />
                        <p className="text-xs text-muted-foreground">
                          Higher = more creative (0–2). Default: 0.7
                        </p>
                      </div>
                      <div className="space-y-2">
                        <label htmlFor="agent-max-tokens" className="text-sm font-medium">
                          Max tokens
                        </label>
                        <Input
                          id="agent-max-tokens"
                          type="number"
                          min={256}
                          max={128000}
                          step={256}
                          value={agentMaxTokens}
                          onChange={(e) => setAgentMaxTokens(Number(e.target.value) || 4096)}
                          className="w-full"
                        />
                        <p className="text-xs text-muted-foreground">
                          Maximum response length. Default: 4096
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              </TabsContent>

              <TabsContent className="mt-0 outline-none" value="templates">
                <div className="space-y-6">
                  <div className="space-y-4">
                    <h4 className="font-medium text-sm">Custom Fonts</h4>
                    <div className="space-y-4">
                      <div
                        onDragOver={handleDragOver}
                        onDragLeave={handleDragLeave}
                        onDrop={handleDrop}
                        onClick={() => fileInputRef.current?.click()}
                        className={`
                          relative border-2 border-dashed rounded-lg p-8 cursor-pointer
                          transition-colors
                          ${isDragging 
                            ? 'border-primary bg-primary/5' 
                            : 'border-muted-foreground/25 hover:border-muted-foreground/50 hover:bg-muted/20'
                          }
                        `}
                      >
                        <input
                          type="file"
                          accept=".ttf,.otf,.woff,.woff2"
                          ref={fileInputRef}
                          onChange={handleFileChange}
                          multiple
                          className="hidden"
                        />
                        <div className="flex flex-col items-center justify-center gap-3 text-center">
                          <Upload className="size-8 text-muted-foreground" />
                          <div className="space-y-1">
                            <p className="text-sm font-medium">
                              Drop font files here or click to select
                            </p>
                            <p className="text-xs text-muted-foreground">
                              Supports: TTF, OTF, WOFF, WOFF2
                            </p>
                          </div>
                        </div>
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
            </div>
          </ScrollArea>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
