"use client";

import { useStore } from "@/lib/store";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Printer, PanelRightClose, PanelRightOpen } from "lucide-react";

export function ExportSidebar() {
    const { activeFileId, toggleRightSidebar, rightSidebarExpanded } = useStore();

    const handlePrint = () => {
        window.print();
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

            <ScrollArea className="flex-1 p-4">
                <div className="space-y-6">
                    <div className="space-y-3">
                        <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">PDF Preview</h3>
                        <div className="aspect-[3/4] bg-white dark:bg-zinc-900 border shadow-sm rounded flex items-center justify-center p-4">
                            <p className="text-[10px] text-muted-foreground text-center">
                                PDF Live Preview Coming Soon
                            </p>
                        </div>
                    </div>



                    <div className="space-y-3">
                        <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Information</h3>
                        <p className="text-xs text-muted-foreground italic">
                            Select a template from the left sidebar to change the look of your PDF.
                        </p>
                    </div>
                </div>
            </ScrollArea>

            <div className="p-4 bg-background shrink-0">
                <Button className="w-full shadow-sm" onClick={handlePrint} disabled={!activeFileId}>
                    <Printer size={16} className="mr-2" />
                    Export PDF
                </Button>
            </div>
        </div>
    );
}
