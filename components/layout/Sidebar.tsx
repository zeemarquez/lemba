"use client";

import { useStore, FileNode } from "@/lib/store";
import { cn } from "@/lib/utils";
import {
    FileText,
    Plus,
    FolderSearch,
    LayoutGrid,
    PanelLeftClose,
    PanelLeftOpen,
    Settings,
    FolderPlus,
    RefreshCw
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useEffect, useState } from "react";
import { FileTree } from "@/components/layout/FileTree";

export function Sidebar() {
    const {
        fileTree,
        activeFileId,
        openFile,
        createFile,
        createFolder,
        fetchFileTree,
        sidebarView,
        setSidebarView,
        toggleLeftSidebar,
        leftSidebarExpanded,
        activeTemplateId,
        openTemplate,
        setSettingsOpen,
        isLoadingFileTree
    } = useStore();

    const [mounted, setMounted] = useState(false);

    useEffect(() => {
        setMounted(true);
        fetchFileTree();
    }, [fetchFileTree]);

    const handleCreateFile = async () => {
        const name = window.prompt("Enter file name (e.g., MyNote.md):");
        if (!name) return;
        
        const fileName = name.endsWith('.md') ? name : `${name}.md`;
        // Determine path based on current view/context?
        // For now, put in root of "Files"
        const path = `Files/${fileName}`;
        await createFile(path);
    };

    const handleCreateFolder = async () => {
        const name = window.prompt("Enter folder name:");
        if (!name) return;
        
        // Put in root of "Files"
        const path = `Files/${name}`;
        await createFolder(path);
    };
    
    // Templates creation (basic implementation for now)
    const handleCreateTemplate = async () => {
        const name = window.prompt("Enter template name (e.g. MyTemplate.md):");
        if (!name) return;
        
        const fileName = name.endsWith('.md') ? name : `${name}.md`;
        const path = `Templates/${fileName}`;
        await createFile(path);
    };

    const handleCreateTemplateFolder = async () => {
        const name = window.prompt("Enter folder name:");
        if (!name) return;
        const path = `Templates/${name}`;
        await createFolder(path);
    }

    const filesRoot = fileTree.find(n => n.name === 'Files');
    const templatesRoot = fileTree.find(n => n.name === 'Templates');

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
                    className="h-8 w-8 text-muted-foreground hover:text-foreground shrink-0"
                    onClick={() => {
                        setSettingsOpen(true);
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
                            <div className="flex items-center gap-1">
                                <Button variant="ghost" size="icon" className="h-6 w-6" onClick={handleCreateFolder} title="New Folder">
                                    <FolderPlus size={14} />
                                </Button>
                                <Button variant="ghost" size="icon" className="h-6 w-6" onClick={handleCreateFile} title="New File">
                                    <Plus size={14} />
                                </Button>
                            </div>
                        </div>
                        
                        {isLoadingFileTree ? (
                             <div className="px-2 py-4 text-xs text-muted-foreground flex items-center gap-2">
                                <RefreshCw size={12} className="animate-spin" /> Loading...
                             </div>
                        ) : (
                            <FileTree 
                                nodes={filesRoot?.children || []} 
                                activeId={activeFileId} 
                                onSelect={(node) => openFile(node.id)}
                            />
                        )}
                        
                        {(!filesRoot || !filesRoot.children?.length) && !isLoadingFileTree && (
                            <div className="px-2 py-4 text-xs text-muted-foreground text-center">
                                No files found. Create one to get started.
                            </div>
                        )}
                    </div>
                )}

                {sidebarView === 'templates' && (
                    <div className="p-3">
                        <div className="flex items-center justify-between mb-2 px-1">
                            <span className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground">Templates</span>
                            <div className="flex items-center gap-1">
                                <Button variant="ghost" size="icon" className="h-6 w-6" onClick={handleCreateTemplateFolder} title="New Folder">
                                    <FolderPlus size={14} />
                                </Button>
                                <Button variant="ghost" size="icon" className="h-6 w-6" onClick={handleCreateTemplate} title="New Template">
                                    <Plus size={14} />
                                </Button>
                            </div>
                        </div>
                        
                        {isLoadingFileTree ? (
                             <div className="px-2 py-4 text-xs text-muted-foreground flex items-center gap-2">
                                <RefreshCw size={12} className="animate-spin" /> Loading...
                             </div>
                        ) : (
                            <FileTree 
                                nodes={templatesRoot?.children || []} 
                                activeId={activeTemplateId} 
                                onSelect={(node) => openTemplate(node.id)}
                            />
                        )}

                        {(!templatesRoot || !templatesRoot.children?.length) && !isLoadingFileTree && (
                            <div className="px-2 py-4 text-xs text-muted-foreground text-center">
                                No templates found.
                            </div>
                        )}
                    </div>
                )}
            </ScrollArea>

            {/* Sidebar Footer - Settings */}
            <div className="p-2 shrink-0">
                <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-muted-foreground hover:text-foreground"
                    onClick={() => setSettingsOpen(true)}
                    title="Settings"
                >
                    <Settings size={18} />
                </Button>
            </div>
        </div>
    );
}
