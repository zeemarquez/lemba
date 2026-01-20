"use client";

import { useStore, FileNode } from "@/lib/store";
import { Button } from "@/components/ui/button";
import { SquareArrowOutUpRight, PanelRightClose, PanelRightOpen, FileText, LayoutTemplate, Check, ChevronRight, Folder, Loader2 } from "lucide-react";
import dynamic from 'next/dynamic';
const PdfPreview = dynamic(() => import("./PdfPreview").then(mod => mod.PdfPreview), { ssr: false });
import { usePdfCompiler } from "@/hooks/use-pdf-compiler";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/plate-ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { useState, useMemo } from "react";

// Helper to filter tree
const filterTree = (nodes: FileNode[], allowedExtensions: string[]): FileNode[] => {
    return nodes.map(node => {
        if (node.type === 'folder') {
            const children = node.children ? filterTree(node.children, allowedExtensions) : [];
            // Keep folder if it has children or if it's a folder (if we want to show empty folders, but let's hide them if empty after filter)
            if (children.length > 0) {
                return { ...node, children };
            }
            return null;
        }
        // Check extension
        const hasExtension = allowedExtensions.some(ext => node.name.endsWith(ext));
        return hasExtension ? node : null;
    }).filter((n): n is FileNode => n !== null);
};

const TreeItem = ({
    node,
    activeId,
    onSelect,
    level = 0
}: {
    node: FileNode;
    activeId: string | null;
    onSelect: (id: string) => void;
    level?: number;
}) => {
    const [expanded, setExpanded] = useState(true);
    const hasChildren = node.type === 'folder' && node.children && node.children.length > 0;
    const paddingLeft = `${level * 12 + 8}px`;
    const displayName = node.name.replace(/\.[^/.]+$/, "");

    return (
        <div>
            <div
                className={cn(
                    "flex items-center gap-1.5 py-1 text-sm rounded-sm cursor-pointer transition-colors group select-none mx-1",
                    activeId === node.id && node.type === 'file' && "bg-accent text-accent-foreground font-medium",
                    (!activeId || activeId !== node.id) && node.type === 'file' ? "hover:bg-accent/50 hover:text-accent-foreground" : "",
                    node.type === 'folder' && "hover:bg-accent/30 text-muted-foreground"
                )}
                style={{ paddingLeft }}
                onClick={(e) => {
                    e.stopPropagation();
                    if (node.type === 'folder') {
                        setExpanded(!expanded);
                    } else {
                        onSelect(node.id);
                    }
                }}
            >
                <span className="flex items-center justify-center w-4 h-4 shrink-0 text-muted-foreground/50">
                    {hasChildren && (
                        <ChevronRight
                            size={12}
                            className={cn("transition-transform", expanded && "rotate-90")}
                        />
                    )}
                </span>

                {node.type === 'folder' ? (
                    <Folder size={14} className="text-blue-400/80 shrink-0" />
                ) : (
                    <FileText size={14} className={cn("text-muted-foreground shrink-0", activeId === node.id && "text-primary")} />
                )}

                <span className="truncate">{displayName}</span>
                {node.type === 'file' && activeId === node.id && <Check size={14} className="ml-auto mr-2 opacity-50" />}
            </div>

            {expanded && hasChildren && node.children && (
                <div>
                    {node.children.map(child => (
                        <TreeItem
                            key={child.id}
                            node={child}
                            activeId={activeId}
                            onSelect={onSelect}
                            level={level + 1}
                        />
                    ))}
                </div>
            )}
        </div>
    );
};

export function ExportSidebar() {
    const {
        activeFileId,
        files,
        toggleRightSidebar,
        rightSidebarExpanded,
        activeTemplateId,
        templates,
        setActiveTemplate,
        fileTree,
        openFile
    } = useStore();

    const [isFileDialogOpen, setIsFileDialogOpen] = useState(false);
    const [isTemplateDialogOpen, setIsTemplateDialogOpen] = useState(false);
    const [isExporting, setIsExporting] = useState(false);

    // Use client-side PDF compiler
    const { compilePdf, isInitialized } = usePdfCompiler();

    const activeTemplate = templates.find(t => t.id === activeTemplateId);

    // Find active file for display name (recursively search in tree if not in flat files list)
    // Actually, store 'files' only contains open files. We need to find name from tree or activeFileId path.
    const getFileName = (path: string | null) => {
        if (!path) return null;
        const name = path.split('/').pop() || path;
        return name.replace(/\.[^/.]+$/, "");
    };

    const activeFileName = getFileName(activeFileId);

    // Find root nodes for Files and Templates to match sidebar behavior
    const filesRoot = fileTree.find(n => n.name === 'Files');
    const templatesRoot = fileTree.find(n => n.name === 'Templates');

    // Filter trees starting from the specific roots
    const mdFilesTree = useMemo(() =>
        filesRoot ? filterTree(filesRoot.children || [], ['.md']) : [],
        [filesRoot]);

    const templateFilesTree = useMemo(() =>
        templatesRoot ? filterTree(templatesRoot.children || [], ['.mdt']) : [],
        [templatesRoot]);

    const handleExport = async () => {
        if (!activeFileId || !isInitialized) return;

        const activeFile = files.find(f => f.id === activeFileId);
        if (!activeFile) return;

        setIsExporting(true);

        try {
            // Compile PDF using client-side WASM compiler
            const pdfBuffer = await compilePdf({
                markdown: activeFile.content,
                title: activeFile.name.replace(/\.[^/.]+$/, ""),
                settings: activeTemplate?.settings,
            });

            // Create blob and download
            const blob = new Blob([pdfBuffer], { type: 'application/pdf' });
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `${activeFile.name.replace(/\.[^/.]+$/, "")}.pdf`;
            document.body.appendChild(a);
            a.click();
            window.URL.revokeObjectURL(url);
            document.body.removeChild(a);
        } catch (error) {
            console.error('Export error:', error);
            alert('Error exporting PDF. Please try again.');
        } finally {
            setIsExporting(false);
        }
    };

    if (!rightSidebarExpanded) {
        return (
            <div className="h-full flex flex-col items-center py-2 bg-muted/30 border-l box-border overflow-hidden app-chrome">
                <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 hover:bg-accent shrink-0"
                    onClick={toggleRightSidebar}
                    title="Expand export"
                >
                    <PanelRightOpen size={18} />
                </Button>
            </div>
        );
    }

    return (
        <div className="h-full flex flex-col bg-muted/30 border-l w-full overflow-hidden app-chrome">
            {/* Export Header */}
            <div className="p-2 flex items-center justify-between shrink-0">
                <span className="font-semibold text-sm px-2">Export</span>
                <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-muted-foreground"
                    onClick={toggleRightSidebar}
                    title="Collapse sidebar"
                >
                    <PanelRightClose size={18} />
                </Button>
            </div>

            <div className="flex-1 flex flex-col p-4 min-h-0 h-full">
                <div className="flex-1 flex flex-col min-h-0 h-full">
                    {/* Controls */}
                    <div className="flex items-center gap-2 shrink-0 mb-3">
                        {/* File Selector */}
                        <Dialog open={isFileDialogOpen} onOpenChange={setIsFileDialogOpen}>
                            <DialogTrigger asChild>
                                <Button
                                    variant="outline"
                                    className="flex-1 h-8 text-xs justify-start px-2 font-normal truncate bg-background"
                                    title={activeFileName || 'Select File'}
                                >
                                    <FileText size={14} className="mr-2 opacity-50 shrink-0" />
                                    <span className="truncate">{activeFileName || 'Select File'}</span>
                                </Button>
                            </DialogTrigger>
                            <DialogContent className="p-0 gap-0 max-w-sm">
                                <DialogHeader className="p-4 pb-2">
                                    <DialogTitle className="text-sm font-medium">Select File</DialogTitle>
                                </DialogHeader>
                                <ScrollArea className="h-[300px] p-2">
                                    <div className="flex flex-col">
                                        {mdFilesTree.map(node => (
                                            <TreeItem
                                                key={node.id}
                                                node={node}
                                                activeId={activeFileId}
                                                onSelect={(id) => {
                                                    openFile(id);
                                                    setIsFileDialogOpen(false);
                                                }}
                                            />
                                        ))}
                                        {mdFilesTree.length === 0 && (
                                            <div className="text-xs text-muted-foreground text-center py-4">No markdown files found</div>
                                        )}
                                    </div>
                                </ScrollArea>
                            </DialogContent>
                        </Dialog>

                        {/* Template Selector */}
                        <Dialog open={isTemplateDialogOpen} onOpenChange={setIsTemplateDialogOpen}>
                            <DialogTrigger asChild>
                                <Button
                                    variant="outline"
                                    className="flex-1 h-8 text-xs justify-start px-2 font-normal truncate bg-background"
                                    title={activeTemplate?.name || 'Select Template'}
                                >
                                    <LayoutTemplate size={14} className="mr-2 opacity-50 shrink-0" />
                                    <span className="truncate">{activeTemplate?.name || 'Select'}</span>
                                </Button>
                            </DialogTrigger>
                            <DialogContent className="p-0 gap-0 max-w-sm">
                                <DialogHeader className="p-4 pb-2">
                                    <DialogTitle className="text-sm font-medium">Select Template</DialogTitle>
                                </DialogHeader>
                                <ScrollArea className="h-[300px] p-2">
                                    <div className="flex flex-col">
                                        {templateFilesTree.map(node => (
                                            <TreeItem
                                                key={node.id}
                                                node={node}
                                                activeId={activeTemplateId}
                                                onSelect={(id) => {
                                                    setActiveTemplate(id);
                                                    setIsTemplateDialogOpen(false);
                                                }}
                                            />
                                        ))}
                                        {templateFilesTree.length === 0 && (
                                            <div className="text-xs text-muted-foreground text-center py-4">No templates found</div>
                                        )}
                                    </div>
                                </ScrollArea>
                            </DialogContent>
                        </Dialog>
                    </div>

                    <PdfPreview />
                </div>
            </div>

            <div className="p-4 bg-background shrink-0">
                <Button 
                    className="w-full shadow-sm" 
                    onClick={handleExport} 
                    disabled={!activeFileId || !isInitialized || isExporting}
                >
                    {isExporting ? (
                        <>
                            <Loader2 size={16} className="mr-2 animate-spin" />
                            Exporting...
                        </>
                    ) : (
                        <>
                            <SquareArrowOutUpRight size={16} className="mr-2" />
                            Export
                        </>
                    )}
                </Button>
            </div>
        </div>
    );
}
