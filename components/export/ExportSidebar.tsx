"use client";

import { useStore } from "@/lib/store";
import { Button } from "@/components/ui/button";
import { SquareArrowOutUpRight, PanelRightClose, PanelRightOpen, ChevronDown } from "lucide-react";
import { PdfPreview } from "@/components/export/PdfPreview";
import { convertIndexedDbImagesToBase64 } from "@/hooks/use-indexed-db-image";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/plate-ui/dropdown-menu";

export function ExportSidebar() {
    const { activeFileId, files, toggleRightSidebar, rightSidebarExpanded, activeTemplateId, templates, setActiveTemplate } = useStore();

    const activeTemplate = templates.find(t => t.id === activeTemplateId);

    const handlePrint = async () => {
        if (!activeFileId) return;

        const activeFile = files.find(f => f.id === activeFileId);
        if (!activeFile) return;

        try {
            // Convert any IndexedDB image URLs to base64 before sending to server
            const markdownWithBase64Images = await convertIndexedDbImagesToBase64(activeFile.content);
            
            const response = await fetch('/api/export-pdf', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    markdown: markdownWithBase64Images,
                    title: activeFile.name.replace(/\.[^/.]+$/, ""),
                    css: activeTemplate?.css || '',
                    settings: activeTemplate?.settings,
                }),
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || 'Failed to export PDF');
            }

            const blob = await response.blob();
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
        }
    };

    if (!rightSidebarExpanded) {
        return (
            <div className="h-full flex flex-col items-center py-2 bg-muted/30 border-l box-border overflow-hidden">
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
        <div className="h-full flex flex-col bg-muted/30 border-l w-full overflow-hidden">
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
                    <div className="flex items-center justify-between shrink-0 mb-3">
                        <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">PDF Preview</h3>
                        <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                                <Button 
                                    variant="outline" 
                                    className="h-7 text-[10px] px-2 gap-1 font-medium bg-muted/50 border-border hover:bg-muted"
                                >
                                    {activeTemplate?.name || 'Select'}
                                    <ChevronDown size={12} className="opacity-50" />
                                </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="min-w-[120px]">
                                {templates.map(t => (
                                    <DropdownMenuItem 
                                        key={t.id} 
                                        onSelect={() => setActiveTemplate(t.id)}
                                        className="text-xs"
                                    >
                                        {t.name}
                                    </DropdownMenuItem>
                                ))}
                            </DropdownMenuContent>
                        </DropdownMenu>
                    </div>
                    <PdfPreview />
                </div>
            </div>

            <div className="p-4 bg-background shrink-0">
                <Button className="w-full shadow-sm" onClick={handlePrint} disabled={!activeFileId}>
                    <SquareArrowOutUpRight size={16} className="mr-2" />
                    Export
                </Button>
            </div>
        </div>
    );
}
