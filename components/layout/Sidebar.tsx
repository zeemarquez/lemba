"use client";

import { useStore, FileNode } from "@/lib/store";
import { browserStorage } from "@/lib/browser-storage";
import { cn } from "@/lib/utils";
import {
    Plus,
    FolderSearch,
    LayoutTemplate,
    PanelLeftClose,
    PanelLeftOpen,
    Settings,
    FolderPlus,
    RefreshCw,
    ChevronRight,
    ChevronDown,
    Bot
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useEffect, useState } from "react";
import { FileTree } from "@/components/layout/FileTree";
import { InputDialog } from "@/components/layout/InputDialog";
import { DocumentOutline } from "@/components/layout/DocumentOutline";
import {
    ResizablePanelGroup,
    ResizablePanel,
    ResizableHandle,
} from "@/components/ui/resizable";
import { LoginButton } from "@/components/auth";
import { SyncStatus } from "@/components/sync";
import { AgentPanel } from "@/components/agent";

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
        restoreSession,
        templates,
        showOutline,
        currentView
    } = useStore();

    const [mounted, setMounted] = useState(false);
    const [dialogOpen, setDialogOpen] = useState(false);
    const [isOutlineCollapsed, setIsOutlineCollapsed] = useState(false);
    const [isFilesCollapsed, setIsFilesCollapsed] = useState(false);
    const [dialogConfig, setDialogConfig] = useState<{
        title: string;
        description: string;
        placeholder: string;
        defaultValue: string;
        confirmLabel: string;
        onConfirm: (val: string) => Promise<void>;
        uploadAccept?: string;
        onUpload?: (fileName: string, content: string) => Promise<void>;
    }>({
        title: "",
        description: "",
        placeholder: "",
        defaultValue: "",
        confirmLabel: "",
        onConfirm: async (val: string) => { }
    });

    useEffect(() => {
        setMounted(true);
        const init = async () => {
            await Promise.all([
                fetchFileTree(),
                fetchTemplates(),
                fetchFonts(),
            ]);
            // Restore session after templates are loaded to ensure template tabs work correctly
            await restoreSession();
        };
        init();
    }, [fetchFileTree, fetchTemplates, fetchFonts, restoreSession]);

    const handleCreateFile = () => {
        setDialogConfig({
            title: "Create New File",
            description: "Enter a name for the new file, or upload an existing .md file.",
            placeholder: "MyNote.md",
            defaultValue: "",
            confirmLabel: "Create File",
            onConfirm: async (name) => {
                const fileName = name.endsWith('.md') ? name : `${name}.md`;
                const path = `Files/${fileName}`;
                await createFile(path);
            },
            uploadAccept: ".md",
            onUpload: async (fileName, content) => {
                const finalName = fileName.endsWith('.md') ? fileName : `${fileName}.md`;
                const path = `Files/${finalName}`;
                await createFile(path, content);
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
            description: "Enter a name for the new template, or upload an existing .mdt file.",
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
                        pageSize: { preset: 'a4' },
                        margins: { top: '20mm', bottom: '20mm', left: '20mm', right: '20mm' },
                        h1: { fontSize: '40px', color: '#000000', textAlign: 'left', borderBottom: false, textTransform: 'none', fontWeight: '700', textDecoration: 'none', numbering: { enabled: false, style: 'decimal', separator: '.', prefix: '', suffix: '.' } },
                        h2: { fontSize: '32px', color: '#000000', textAlign: 'left', borderBottom: false, textTransform: 'none', fontWeight: '600', textDecoration: 'none', numbering: { enabled: false, style: 'decimal', separator: '.', prefix: '', suffix: '.' } },
                        h3: { fontSize: '24px', color: '#000000', textAlign: 'left', borderBottom: false, textTransform: 'none', fontWeight: '600', textDecoration: 'none', numbering: { enabled: false, style: 'decimal', separator: '.', prefix: '', suffix: '.' } },
                        h4: { fontSize: '20px', color: '#000000', textAlign: 'left', borderBottom: false, textTransform: 'none', fontWeight: '600', textDecoration: 'none', numbering: { enabled: false, style: 'decimal', separator: '.', prefix: '', suffix: '.' } },
                        h5: { fontSize: '18px', color: '#000000', textAlign: 'left', borderBottom: false, textTransform: 'none', fontWeight: '600', textDecoration: 'none', numbering: { enabled: false, style: 'decimal', separator: '.', prefix: '', suffix: '.' } },
                        h6: { fontSize: '16px', color: '#000000', textAlign: 'left', borderBottom: false, textTransform: 'none', fontWeight: '600', textDecoration: 'none', numbering: { enabled: false, style: 'decimal', separator: '.', prefix: '', suffix: '.' } },
                        header: { enabled: false, content: '', margins: { bottom: '5mm', left: '0mm', right: '0mm' } },
                        footer: { enabled: false, content: '', margins: { top: '5mm', left: '0mm', right: '0mm' } },
                    }
                };

                // @ts-ignore
                await createTemplate(path, newTemplate);
            },
            uploadAccept: ".mdt",
            onUpload: async (fileName, content) => {
                const finalName = fileName.endsWith('.mdt') ? fileName : `${fileName}.mdt`;
                const path = `Templates/${finalName}`;

                try {
                    const uploadedTemplate = JSON.parse(content);
                    // Update the id and name to match the new path
                    uploadedTemplate.id = path;
                    uploadedTemplate.name = finalName.replace('.mdt', '');
                    // @ts-ignore
                    await createTemplate(path, uploadedTemplate);
                } catch (e) {
                    console.error('Failed to parse template file:', e);
                    throw new Error('Invalid template file format');
                }
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

    const handleExportFile = async (node: FileNode) => {
        try {
            const content = await browserStorage.readFile(node.id);
            const blob = new Blob([content], { type: 'text/markdown' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = node.name;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        } catch (error) {
            console.error('Failed to export file:', error);
        }
    };

    const handleExportTemplate = async (node: FileNode) => {
        try {
            const template = templates.find(t => t.id === node.id);
            if (!template) {
                console.error('Template not found:', node.id);
                return;
            }
            const content = JSON.stringify(template, null, 2);
            const blob = new Blob([content], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            // Ensure the file has .mdt extension
            const fileName = node.name.endsWith('.mdt') ? node.name : `${node.name}.mdt`;
            a.download = fileName;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        } catch (error) {
            console.error('Failed to export template:', error);
        }
    };

    const filesRoot = fileTree.find(n => n.name === 'Files');
    const templatesRoot = fileTree.find(n => n.name === 'Templates');

    if (!leftSidebarExpanded) {
        return (
            <div className="h-full flex flex-col items-center py-2 bg-muted/30 box-border overflow-hidden app-chrome">
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
                <div className="flex flex-col gap-1 items-center">
                    <LoginButton size="icon" showLabel={false} />
                    <SyncStatus size="icon" showLabel={false} />
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
            </div>
        );
    }

    return (
        <>
            <div className="h-full flex flex-col bg-muted/30 w-full overflow-hidden app-chrome">
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
                    <Button
                        variant="ghost"
                        size="icon"
                        className={cn("h-8 w-8", sidebarView === 'agent' && "bg-accent text-accent-foreground")}
                        onClick={() => setSidebarView('agent')}
                        title="AI Assistant"
                    >
                        <Bot size={18} />
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

                {sidebarView === 'explorer' && showOutline && currentView === 'file' && activeFileId && (
                    <ResizablePanelGroup direction="vertical" className="flex-1 min-h-0">
                        {/* Files Panel */}
                        <ResizablePanel
                            defaultSize={60}
                            minSize={20}
                            collapsible={true}
                            collapsedSize={8}
                            onCollapse={() => setIsFilesCollapsed(true)}
                            onExpand={() => setIsFilesCollapsed(false)}
                        >
                            <div className="h-full flex flex-col">
                                <div
                                    className="flex items-center justify-between px-3 py-2 cursor-pointer hover:bg-accent/30 shrink-0"
                                    onClick={() => setIsFilesCollapsed(!isFilesCollapsed)}
                                >
                                    <div className="flex items-center gap-2">
                                        {isFilesCollapsed ? (
                                            <ChevronRight size={14} className="text-muted-foreground" />
                                        ) : (
                                            <ChevronDown size={14} className="text-muted-foreground" />
                                        )}
                                        <span className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground">Files</span>
                                    </div>
                                    {!isFilesCollapsed && (
                                        <div className="flex items-center gap-1">
                                            <Button variant="ghost" size="icon" className="h-6 w-6" onClick={(e) => { e.stopPropagation(); handleCreateFolder(); }} title="New Folder">
                                                <FolderPlus size={14} />
                                            </Button>
                                            <Button variant="ghost" size="icon" className="h-6 w-6" onClick={(e) => { e.stopPropagation(); handleCreateFile(); }} title="New File">
                                                <Plus size={14} />
                                            </Button>
                                        </div>
                                    )}
                                </div>

                                {!isFilesCollapsed && (
                                    <ScrollArea className="flex-1">
                                        <div className="px-3 pb-2">
                                            {isLoadingFileTree ? (
                                                <div className="px-2 py-4 text-xs text-muted-foreground flex items-center gap-2">
                                                    <div className="animate-spin flex items-center justify-center">
                                                        <RefreshCw size={12} />
                                                    </div>
                                                    Loading...
                                                </div>
                                            ) : (
                                                <FileTree
                                                    nodes={filesRoot?.children || []}
                                                    activeId={activeFileId}
                                                    onSelect={(node) => openFile(node.id)}
                                                    onRename={handleRename}
                                                    onDelete={handleDelete}
                                                    onMove={handleMove}
                                                    onExport={handleExportFile}
                                                />
                                            )}

                                            {(!filesRoot || !filesRoot.children?.length) && !isLoadingFileTree && (
                                                <div className="px-2 py-4 text-xs text-muted-foreground text-center">
                                                    No files found. Create one to get started.
                                                </div>
                                            )}
                                        </div>
                                    </ScrollArea>
                                )}
                            </div>
                        </ResizablePanel>

                        <ResizableHandle />

                        {/* Outline Panel */}
                        <ResizablePanel
                            defaultSize={40}
                            minSize={15}
                            collapsible={true}
                            collapsedSize={8}
                            onCollapse={() => setIsOutlineCollapsed(true)}
                            onExpand={() => setIsOutlineCollapsed(false)}
                        >
                            <DocumentOutline
                                className="h-full"
                                isCollapsed={isOutlineCollapsed}
                                onToggleCollapse={() => setIsOutlineCollapsed(!isOutlineCollapsed)}
                            />
                        </ResizablePanel>
                    </ResizablePanelGroup>
                )}

                {sidebarView === 'explorer' && (!showOutline || currentView !== 'file' || !activeFileId) && (
                    <ScrollArea className="flex-1">
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
                                    <div className="animate-spin flex items-center justify-center">
                                        <RefreshCw size={12} />
                                    </div>
                                    Loading...
                                </div>
                            ) : (
                                <FileTree
                                    nodes={filesRoot?.children || []}
                                    activeId={activeFileId}
                                    onSelect={(node) => openFile(node.id)}
                                    onRename={handleRename}
                                    onDelete={handleDelete}
                                    onMove={handleMove}
                                    onExport={handleExportFile}
                                />
                            )}

                            {(!filesRoot || !filesRoot.children?.length) && !isLoadingFileTree && (
                                <div className="px-2 py-4 text-xs text-muted-foreground text-center">
                                    No files found. Create one to get started.
                                </div>
                            )}
                        </div>
                    </ScrollArea>
                )}

                {sidebarView === 'templates' && (
                    <ScrollArea className="flex-1">
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
                                    <div className="animate-spin flex items-center justify-center">
                                        <RefreshCw size={12} />
                                    </div>
                                    Loading...
                                </div>
                            ) : (
                                <FileTree
                                    nodes={templatesRoot?.children || []}
                                    activeId={activeTemplateId}
                                    onSelect={(node) => openTemplate(node.id)}
                                    onRename={handleRename}
                                    onDelete={handleDelete}
                                    onMove={handleMove}
                                    onExport={handleExportTemplate}
                                />
                            )}

                            {(!templatesRoot || !templatesRoot.children?.length) && !isLoadingFileTree && (
                                <div className="px-2 py-4 text-xs text-muted-foreground text-center">
                                    No templates found.
                                </div>
                            )}
                        </div>
                    </ScrollArea>
                )}

                {/* AI Agent Panel */}
                {sidebarView === 'agent' && (
                    <AgentPanel />
                )}

                {/* Sidebar Footer - Auth, Sync, Settings */}
                <div className="p-2 shrink-0 flex items-center gap-1 border-t border-border/50">
                    <LoginButton size="icon" showLabel={false} />
                    <SyncStatus size="icon" showLabel={false} />
                    <div className="flex-1" />
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
