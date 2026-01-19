"use client";

import { useStore, FileNode } from "@/lib/store";
import { cn } from "@/lib/utils";
import {
    FileText,
    Plus,
    FolderSearch,
    LayoutTemplate,
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
import { InputDialog } from "@/components/layout/InputDialog";

export function Sidebar() {
    const {
        fileTree,
        activeFileId,
        openFile,
        createFile,
        createFolder,
        fetchFileTree,
        fetchTemplates,
        sidebarView,
        setSidebarView,
        toggleLeftSidebar,
        leftSidebarExpanded,
        activeTemplateId,
        openTemplate,
        createTemplate,
        deleteItem,
        renameItem,
        moveItem,
        setSettingsOpen,
        isLoadingFileTree,
        fetchFonts,
        restoreSession
    } = useStore();

    const [mounted, setMounted] = useState(false);
    const [dialogOpen, setDialogOpen] = useState(false);
    const [dialogConfig, setDialogConfig] = useState({
        title: "",
        description: "",
        placeholder: "",
        defaultValue: "",
        confirmLabel: "",
        onConfirm: async (val: string) => {}
    });

    useEffect(() => {
        setMounted(true);
        fetchFileTree();
        fetchTemplates();
        fetchFonts();
        restoreSession();
    }, [fetchFileTree, fetchTemplates, fetchFonts, restoreSession]);

    const handleCreateFile = () => {
        setDialogConfig({
            title: "Create New File",
            description: "Enter a name for the new file.",
            placeholder: "MyNote.md",
            defaultValue: "",
            confirmLabel: "Create File",
            onConfirm: async (name) => {
                const fileName = name.endsWith('.md') ? name : `${name}.md`;
                const path = `Files/${fileName}`;
                await createFile(path);
            }
        });
        setDialogOpen(true);
    };

    const handleCreateFolder = () => {
        setDialogConfig({
            title: "Create New Folder",
            description: "Enter a name for the new folder.",
            placeholder: "Folder Name",
            defaultValue: "",
            confirmLabel: "Create Folder",
            onConfirm: async (name) => {
                const path = `Files/${name}`;
                await createFolder(path);
            }
        });
        setDialogOpen(true);
    };
    
    const handleCreateTemplate = () => {
        setDialogConfig({
            title: "Create New Template",
            description: "Enter a name for the new template.",
            placeholder: "MyTemplate.mdt",
            defaultValue: "",
            confirmLabel: "Create Template",
            onConfirm: async (name) => {
                const fileName = name.endsWith('.mdt') ? name : `${name}.mdt`;
                const path = `Templates/${fileName}`;
                
                const newTemplate = {
                    id: path, // Will be used as ID
                    name: name.replace('.mdt', ''),
                    css: '',
                    settings: {
                        fontFamily: 'Inter, sans-serif',
                        fontSize: '16px',
                        textColor: '#000000',
                        backgroundColor: '#ffffff',
                        pageLayout: 'vertical',
                        margins: { top: '20mm', bottom: '20mm', left: '20mm', right: '20mm' },
                        h1: { fontSize: '2.5em', color: '#000000', textAlign: 'left', borderBottom: false, textTransform: 'none', fontWeight: '700', textDecoration: 'none', numbering: { enabled: false, style: 'decimal', separator: '.', prefix: '', suffix: '.' } },
                        h2: { fontSize: '2em', color: '#000000', textAlign: 'left', borderBottom: false, textTransform: 'none', fontWeight: '600', textDecoration: 'none', numbering: { enabled: false, style: 'decimal', separator: '.', prefix: '', suffix: '.' } },
                        h3: { fontSize: '1.5em', color: '#000000', textAlign: 'left', borderBottom: false, textTransform: 'none', fontWeight: '600', textDecoration: 'none', numbering: { enabled: false, style: 'decimal', separator: '.', prefix: '', suffix: '.' } },
                        h4: { fontSize: '1.25em', color: '#000000', textAlign: 'left', borderBottom: false, textTransform: 'none', fontWeight: '600', textDecoration: 'none', numbering: { enabled: false, style: 'decimal', separator: '.', prefix: '', suffix: '.' } },
                        h5: { fontSize: '1.1em', color: '#000000', textAlign: 'left', borderBottom: false, textTransform: 'none', fontWeight: '600', textDecoration: 'none', numbering: { enabled: false, style: 'decimal', separator: '.', prefix: '', suffix: '.' } },
                        h6: { fontSize: '1em', color: '#000000', textAlign: 'left', borderBottom: false, textTransform: 'none', fontWeight: '600', textDecoration: 'none', numbering: { enabled: false, style: 'decimal', separator: '.', prefix: '', suffix: '.' } },
                        header: { enabled: false, content: '', margins: { top: '0mm', bottom: '5mm', left: '0mm', right: '0mm' } },
                        footer: { enabled: false, content: '', margins: { top: '5mm', bottom: '0mm', left: '0mm', right: '0mm' } },
                    }
                };
                
                // @ts-ignore
                await createTemplate(path, newTemplate);
            }
        });
        setDialogOpen(true);
    };

    const handleCreateTemplateFolder = () => {
        setDialogConfig({
            title: "Create Template Folder",
            description: "Enter a name for the new template folder.",
            placeholder: "Folder Name",
            defaultValue: "",
            confirmLabel: "Create Folder",
            onConfirm: async (name) => {
                const path = `Templates/${name}`;
                await createFolder(path);
            }
        });
        setDialogOpen(true);
    }

    const handleRename = (node: FileNode) => {
        setDialogConfig({
            title: "Rename Item",
            description: `Enter a new name for ${node.name}`,
            placeholder: node.name,
            defaultValue: node.name,
            confirmLabel: "Rename",
            onConfirm: async (newName) => {
                if (newName === node.name) return;
                
                // Preserve extension if user didn't type it and original had it?
                // Or just let user type whatever.
                // Best to enforce extension for files if missing.
                let finalName = newName;
                if (node.type === 'file') {
                    if (node.id.startsWith('Files/') && !finalName.endsWith('.md')) finalName += '.md';
                    if (node.id.startsWith('Templates/') && !finalName.endsWith('.mdt') && !finalName.endsWith('.json')) finalName += '.mdt';
                }

                // Construct new path
                const parentPath = node.id.substring(0, node.id.lastIndexOf('/'));
                const newPath = `${parentPath}/${finalName}`;
                
                await renameItem(node.id, newPath);
            }
        });
        setDialogOpen(true);
    };

    const handleDelete = async (node: FileNode) => {
        if (confirm(`Are you sure you want to delete ${node.name}?`)) {
            await deleteItem(node.id, node.type);
        }
    };

    const handleMove = async (source: FileNode, target: FileNode) => {
        // Target is the folder we are dropping into
        const newPath = `${target.id}/${source.name}`;
        await moveItem(source.id, newPath);
    };

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
        <>
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
                        <LayoutTemplate size={18} />
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
                                    onRename={handleRename}
                                    onDelete={handleDelete}
                                    onMove={handleMove}
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
                                    onRename={handleRename}
                                    onDelete={handleDelete}
                                    onMove={handleMove}
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

            <InputDialog 
                isOpen={dialogOpen}
                onOpenChange={setDialogOpen}
                {...dialogConfig}
            />
        </>
    );
}
