"use client";

import { useStore } from "@/lib/store";
import { cn } from "@/lib/utils";
import {
    FileText,
    Plus,
    FolderSearch,
    LayoutGrid,
    PanelLeftClose,
    PanelLeftOpen,
    Settings,
    Moon,
    Sun,
    Monitor
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useTheme } from "next-themes";
import { useEffect, useState } from "react";

export function Sidebar() {
    const {
        files,
        activeFileId,
        openFile,
        addFile,
        sidebarView,
        setSidebarView,
        toggleLeftSidebar,
        leftSidebarExpanded,
        templates,
        activeTemplateId,
        addTemplate,
        openTemplate
    } = useStore();
    const { theme, setTheme } = useTheme();
    const [mounted, setMounted] = useState(false);

    useEffect(() => {
        setMounted(true);
    }, []);

    const handleCreateFile = () => {
        const newId = (Math.random() * 10000).toString();
        addFile({
            id: newId,
            name: `Untitled-${files.length}.md`,
            content: '',
            language: 'markdown'
        });
        openFile(newId);
    };

    const handleCreateTemplate = () => {
        const newId = (Math.random() * 10000).toString();
        addTemplate({
            id: newId,
            name: `Template-${templates.length}`,
            css: '',
            settings: {
                fontFamily: 'Inter, sans-serif',
                fontSize: '16px',
                textColor: '#000000',
                backgroundColor: '#ffffff',
                h1: { fontSize: '2.5em', color: '#000000', textAlign: 'left', borderBottom: false, textTransform: 'none' },
                h2: { fontSize: '2em', color: '#000000', textAlign: 'left', borderBottom: false, textTransform: 'none' },
                margins: '20mm'
            }
        });
        openTemplate(newId);
    };

    if (!leftSidebarExpanded) {
        return (
            <div className="h-full flex flex-col items-center py-2 bg-muted/30 border-r box-border overflow-hidden">
                <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 mb-4 hover:bg-accent shrink-0"
                    onClick={toggleLeftSidebar}
                    title="Expand sidebar"
                >
                    <PanelLeftOpen size={18} />
                </Button>
                <div className="flex-1" />
                <Button
                    variant="ghost"
                    size="icon"
                    className={cn("h-8 w-8 text-muted-foreground hover:text-foreground shrink-0", sidebarView === 'settings' && "bg-accent text-accent-foreground")}
                    onClick={() => {
                        toggleLeftSidebar();
                        setSidebarView('settings');
                    }}
                    title="Settings"
                >
                    <Settings size={18} />
                </Button>
            </div>
        );
    }

    return (
        <div className="h-full flex flex-col bg-muted/30 border-r w-full overflow-hidden">
            {/* Sidebar Header */}
            <div className="p-2 flex items-center justify-between shrink-0">
                <Button
                    variant="ghost"
                    size="icon"
                    className={cn("h-8 w-8", sidebarView === 'explorer' && "bg-accent text-accent-foreground")}
                    onClick={() => setSidebarView('explorer')}
                    title="Explorer"
                >
                    <FolderSearch size={18} />
                </Button>
                <Button
                    variant="ghost"
                    size="icon"
                    className={cn("h-8 w-8", sidebarView === 'templates' && "bg-accent text-accent-foreground")}
                    onClick={() => setSidebarView('templates')}
                    title="Templates"
                >
                    <LayoutGrid size={18} />
                </Button>
                <div className="flex-1" />
                <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    onClick={toggleLeftSidebar}
                    title="Collapse sidebar"
                >
                    <PanelLeftClose size={18} />
                </Button>
            </div>

            <ScrollArea className="flex-1">
                {sidebarView === 'explorer' && (
                    <div className="p-3">
                        <div className="flex items-center justify-between mb-2 px-1">
                            <span className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground">Files</span>
                            <Button variant="ghost" size="icon" className="h-5 w-5" onClick={handleCreateFile}>
                                <Plus size={12} />
                            </Button>
                        </div>
                        <div className="space-y-0.5">
                            {files.map((file) => (
                                <div
                                    key={file.id}
                                    onClick={() => openFile(file.id)}
                                    className={cn(
                                        "flex items-center gap-2 px-2 py-1.5 text-sm rounded-md cursor-pointer hover:bg-accent hover:text-accent-foreground transition-colors group",
                                        activeFileId === file.id && "bg-accent text-accent-foreground font-medium"
                                    )}
                                >
                                    <FileText size={14} className={cn("opacity-40", activeFileId === file.id && "opacity-100 text-primary")} />
                                    <span className="truncate">{file.name}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {sidebarView === 'templates' && (
                    <div className="p-3">
                        <div className="flex items-center justify-between mb-2 px-1">
                            <span className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground">Export Templates</span>
                            <Button variant="ghost" size="icon" className="h-5 w-5" onClick={handleCreateTemplate}>
                                <Plus size={12} />
                            </Button>
                        </div>
                        <div className="space-y-0.5">
                            {templates.map((template) => (
                                <div
                                    key={template.id}
                                    onClick={() => openTemplate(template.id)}
                                    className={cn(
                                        "flex items-center gap-2 px-2 py-1.5 text-sm rounded-md cursor-pointer hover:bg-accent hover:text-accent-foreground transition-colors group",
                                        activeTemplateId === template.id && "bg-accent text-accent-foreground font-medium"
                                    )}
                                >
                                    <LayoutGrid size={14} className={cn("opacity-40", activeTemplateId === template.id && "opacity-100 text-primary")} />
                                    <span className="truncate">{template.name}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {sidebarView === 'settings' && (
                    <div className="p-4 space-y-6">
                        <div>
                            <h3 className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground mb-4">Appearance</h3>
                            <div className="grid grid-cols-1 gap-2">
                                <Button
                                    variant={mounted && theme === 'light' ? 'secondary' : 'outline'}
                                    className="justify-start gap-2 h-9 text-xs"
                                    onClick={() => setTheme('light')}
                                >
                                    <Sun size={14} /> Light
                                </Button>
                                <Button
                                    variant={mounted && theme === 'dark' ? 'secondary' : 'outline'}
                                    className="justify-start gap-2 h-9 text-xs"
                                    onClick={() => setTheme('dark')}
                                >
                                    <Moon size={14} /> Dark
                                </Button>
                                <Button
                                    variant={mounted && theme === 'system' ? 'secondary' : 'outline'}
                                    className="justify-start gap-2 h-9 text-xs"
                                    onClick={() => setTheme('system')}
                                >
                                    <Monitor size={14} /> System
                                </Button>
                            </div>
                        </div>
                    </div>
                )}
            </ScrollArea>

            {/* Sidebar Footer - Settings */}
            <div className="p-2 shrink-0">
                <Button
                    variant="ghost"
                    size="icon"
                    className={cn("h-8 w-8 text-muted-foreground hover:text-foreground", sidebarView === 'settings' && "bg-accent text-accent-foreground")}
                    onClick={() => setSidebarView('settings')}
                    title="Settings"
                >
                    <Settings size={18} />
                </Button>
            </div>
        </div>
    );
}
