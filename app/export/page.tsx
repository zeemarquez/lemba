"use client";

import { useStore, FileNode, TemplateVariable } from "@/lib/store";
import { Button } from "@/components/ui/button";
import { SquareArrowOutUpRight, FileText, LayoutTemplate, Check, ChevronRight, Folder, Loader2, Variable } from "lucide-react";
import dynamic from 'next/dynamic';
const PdfPreview = dynamic(() => import("@/components/export/PdfPreview").then(mod => mod.PdfPreview), { ssr: false });
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
import { useState, useMemo, useEffect } from "react";
import { Input } from "@/components/plate-ui/input";
import { parseVariablesFromFrontmatter, updateFrontmatterVariables } from "@/components/export/ExportSidebar";
import { useCustomFonts } from "@/hooks/use-custom-fonts";

// Helper to filter tree
const filterTree = (nodes: FileNode[], allowedExtensions: string[]): FileNode[] => {
    return nodes.map(node => {
        if (node.type === 'folder') {
            const children = node.children ? filterTree(node.children, allowedExtensions) : [];
            if (children.length > 0) {
                return { ...node, children };
            }
            return null;
        }
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

export default function ExportPage() {
    const {
        activeFileId,
        files,
        activeTemplateId,
        templates,
        setActiveTemplate,
        fileTree,
        openFile,
        updateFileContent,
        saveFile,
        setExportWindowOpen,
        fetchFileTree,
        fetchTemplates,
        fetchFonts,
        restoreSession
    } = useStore();

    const [isFileDialogOpen, setIsFileDialogOpen] = useState(false);
    const [isTemplateDialogOpen, setIsTemplateDialogOpen] = useState(false);
    const [isVariablesDialogOpen, setIsVariablesDialogOpen] = useState(false);
    const [isExporting, setIsExporting] = useState(false);
    const [variableValues, setVariableValues] = useState<Record<string, string>>({});
    const [isInitializing, setIsInitializing] = useState(true);

    // Initialize custom fonts
    useCustomFonts();

    const { compilePdf, isInitialized } = usePdfCompiler();

    const activeTemplate = templates.find(t => t.id === activeTemplateId);
    const templateVariables = activeTemplate?.settings?.variables || [];
    
    const activeFile = files.find(f => f.id === activeFileId);
    
    // Initialize store data on mount (same as main app does in Sidebar)
    useEffect(() => {
        const init = async () => {
            setIsInitializing(true);
            await Promise.all([
                fetchFileTree(),
                fetchTemplates(),
                fetchFonts(),
            ]);
            await restoreSession();
            setIsInitializing(false);
        };
        init();
    }, [fetchFileTree, fetchTemplates, fetchFonts, restoreSession]);

    // Handle window close - reset exportWindowOpen state
    useEffect(() => {
        const handleBeforeUnload = () => {
            setExportWindowOpen(false);
        };
        
        window.addEventListener('beforeunload', handleBeforeUnload);
        return () => {
            window.removeEventListener('beforeunload', handleBeforeUnload);
        };
    }, [setExportWindowOpen]);
    
    useEffect(() => {
        if (activeFile?.content) {
            const parsed = parseVariablesFromFrontmatter(activeFile.content);
            setVariableValues(parsed);
        } else {
            setVariableValues({});
        }
    }, [activeFile?.content, activeFileId]);
    
    const handleSaveVariables = async () => {
        if (!activeFile || !activeFileId) return;
        
        const updatedContent = updateFrontmatterVariables(activeFile.content, variableValues);
        updateFileContent(activeFileId, updatedContent);
        await saveFile(activeFileId, updatedContent);
        setIsVariablesDialogOpen(false);
    };
    
    const filledVariablesCount = templateVariables.filter(
        (v: TemplateVariable) => v.name && variableValues[v.name]?.trim()
    ).length;

    const getFileName = (path: string | null) => {
        if (!path) return null;
        const name = path.split('/').pop() || path;
        return name.replace(/\.[^/.]+$/, "");
    };

    const activeFileName = getFileName(activeFileId);
    const activeTemplateFileName = getFileName(activeTemplateId);

    const filesRoot = fileTree.find(n => n.name === 'Files');
    const templatesRoot = fileTree.find(n => n.name === 'Templates');

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
            const pdfBuffer = await compilePdf({
                markdown: activeFile.content,
                title: activeFile.name.replace(/\.[^/.]+$/, ""),
                settings: activeTemplate?.settings,
            });

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

    // Show loading state while initializing
    if (isInitializing) {
        return (
            <div className="h-full flex flex-col bg-background items-center justify-center">
                <div className="flex flex-col items-center gap-3">
                    <Loader2 size={24} className="animate-spin text-muted-foreground" />
                    <p className="text-sm text-muted-foreground">Loading...</p>
                </div>
            </div>
        );
    }

    return (
        <div className="h-full flex flex-col bg-background">
            {/* Export Header */}
            <div className="p-2 flex items-center justify-between shrink-0 border-b">
                <span className="font-semibold text-sm px-2">Export</span>
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
                                    title={activeTemplateFileName || 'Select Template'}
                                >
                                    <LayoutTemplate size={14} className="mr-2 opacity-50 shrink-0" />
                                    <span className="truncate">{activeTemplateFileName || 'Select'}</span>
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

                    {/* Variables Button - only show if template has variables */}
                    {templateVariables.length > 0 && (
                        <div className="shrink-0 mb-3">
                            <Dialog open={isVariablesDialogOpen} onOpenChange={setIsVariablesDialogOpen}>
                                <DialogTrigger asChild>
                                    <Button
                                        variant="outline"
                                        className="w-full h-8 text-xs justify-start px-2 font-normal bg-background"
                                        title="Set variable values"
                                    >
                                        <Variable size={14} className="mr-2 opacity-50 shrink-0" />
                                        <span className="truncate">Variables</span>
                                    </Button>
                                </DialogTrigger>
                                <DialogContent className="p-0 gap-0 w-[300px]">
                                    <DialogHeader className="p-3 pb-0">
                                        <DialogTitle className="text-sm font-medium">Variables</DialogTitle>
                                        <p className="text-[10px] text-muted-foreground pt-1">
                                            Values stored in document.
                                        </p>
                                    </DialogHeader>
                                    <div className="px-3 pb-3 pt-4 space-y-3">
                                        {templateVariables.filter((v: TemplateVariable) => v.name.trim()).map((variable: TemplateVariable) => (
                                            <div key={variable.id} className="flex items-center gap-2">
                                                <span className="text-xs font-medium text-muted-foreground w-20 shrink-0 truncate">
                                                    {variable.name}
                                                </span>
                                                <Input
                                                    type="text"
                                                    placeholder="Value"
                                                    className="h-8 text-sm flex-1"
                                                    value={variableValues[variable.name] || ''}
                                                    onChange={(e) => setVariableValues(prev => ({
                                                        ...prev,
                                                        [variable.name]: e.target.value
                                                    }))}
                                                />
                                            </div>
                                        ))}
                                        <div className="flex justify-end pt-2">
                                            <Button
                                                size="sm"
                                                className="h-7 text-xs"
                                                onClick={handleSaveVariables}
                                                disabled={!activeFile}
                                            >
                                                Save
                                            </Button>
                                        </div>
                                    </div>
                                </DialogContent>
                            </Dialog>
                        </div>
                    )}

                    <PdfPreview isStandaloneWindow />
                </div>
            </div>

            <div className="p-4 bg-muted/30 shrink-0 border-t">
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
