"use client";

import { useStore } from "@/lib/store";
import {
    ResizableHandle,
    ResizablePanel,
    ResizablePanelGroup,
} from "@/components/ui/resizable";
import { cn } from "@/lib/utils";
import { Sidebar } from "@/components/layout/Sidebar";
import { ScrollArea } from "@/components/ui/scroll-area";
import { FileText, X, LayoutTemplate } from "lucide-react";
import { ExportSidebar } from "@/components/export/ExportSidebar";
import { PrintStyles } from "@/components/export/PrintStyles";
import { useRef, useEffect } from "react";
import { ImperativePanelHandle } from "react-resizable-panels";
import { DndProvider } from 'react-dnd';
import { HTML5Backend } from 'react-dnd-html5-backend';

export function AppShell({ children }: { children: React.ReactNode }) {
    const {
        leftSidebarExpanded,
        rightSidebarExpanded,
        openTabs,
        openFile,
        openTemplate,
        closeTab,
        files,
        templates,
        activeFileId,
        activeTemplateId,
        currentView,
        toggleLeftSidebar,
        toggleRightSidebar
    } = useStore();

    const leftPanelRef = useRef<ImperativePanelHandle>(null);
    const rightPanelRef = useRef<ImperativePanelHandle>(null);

    // Sync left sidebar physical collapse state
    useEffect(() => {
        const panel = leftPanelRef.current;
        if (!panel) return;
        if (leftSidebarExpanded) {
            panel.expand();
        } else {
            panel.collapse();
        }
    }, [leftSidebarExpanded]);

    // Sync right sidebar physical collapse state
    useEffect(() => {
        const panel = rightPanelRef.current;
        if (!panel) return;
        if (rightSidebarExpanded) {
            panel.expand();
        } else {
            panel.collapse();
        }
    }, [rightSidebarExpanded]);

    return (
        <DndProvider backend={HTML5Backend}>
            <div className="h-screen w-full bg-background text-foreground overflow-hidden flex flex-col">
                <ResizablePanelGroup id="main-panel-group" direction="horizontal" className="flex-1 w-full h-full">
                    {/* Left Sidebar */}
                    <ResizablePanel
                        ref={leftPanelRef}
                        id="sidebar-panel"
                        defaultSize={20}
                        minSize={12}
                        maxSize={30}
                        collapsible={true}
                        collapsedSize={4}
                        onCollapse={() => { if (leftSidebarExpanded) toggleLeftSidebar(); }}
                        onExpand={() => { if (!leftSidebarExpanded) toggleLeftSidebar(); }}
                    >
                        <Sidebar />
                    </ResizablePanel>
                    <ResizableHandle id="sidebar-handle" />

                    {/* Main Content */}
                    <ResizablePanel id="editor-panel" defaultSize={50} className="flex flex-col h-full bg-background min-w-0 min-h-0">
                        {/* Tab Bar Container */}
                        <div className="flex items-end bg-muted/20 h-11 overflow-x-auto overflow-y-hidden no-scrollbar scroll-smooth shrink-0 relative">
                            {/* Prefix line (before first tab) */}
                            <div className="w-2 h-full border-b border-border shrink-0" />
                            {openTabs.map(tab => {
                                const isFile = tab.type === 'file';
                                const data = isFile
                                    ? files.find(f => f.id === tab.id)
                                    : templates.find(t => t.id === tab.id);

                                if (!data) return null;
                                const isActive = isFile
                                    ? (currentView === 'file' && activeFileId === tab.id)
                                    : (currentView === 'template' && activeTemplateId === tab.id);

                                return (
                                    <div
                                        key={`${tab.type}-${tab.id}`}
                                        className={cn(
                                            "group relative flex items-center gap-2 px-4 h-9 text-xs transition-all cursor-pointer select-none min-w-[140px] max-w-[220px]",
                                            isActive
                                                ? "bg-background border-x border-t border-border rounded-t-[10px] text-foreground font-semibold z-20"
                                                : "bg-transparent border-b border-border text-muted-foreground hover:bg-muted/30"
                                        )}
                                        onClick={() => isFile ? openFile(tab.id) : openTemplate(tab.id)}
                                    >
                                        {/* Inverted Radius Shoulders (Seamless Junction) */}
                                        {isActive && (
                                            <>
                                                {/* Left side scoop SVG */}
                                                <div className="absolute -left-[10px] bottom-0 w-[10px] h-[10px] pointer-events-none z-20">
                                                    <svg className="w-full h-full text-background fill-current overflow-visible" viewBox="0 0 10 10">
                                                        <path d="M 0 10 L 10 10 L 10 0 Q 10 10 0 10 Z" />
                                                        <path d="M 0 10 Q 10 10 10 0" fill="none" stroke="currentColor" strokeWidth="1" className="text-border" />
                                                    </svg>
                                                </div>

                                                {/* Right side scoop SVG */}
                                                <div className="absolute -right-[10px] bottom-0 w-[10px] h-[10px] pointer-events-none z-20">
                                                    <svg className="w-full h-full text-background fill-current overflow-visible" viewBox="0 0 10 10">
                                                        <path d="M 0 0 Q 0 10 10 10 L 0 10 Z" />
                                                        <path d="M 0 0 Q 0 10 10 10" fill="none" stroke="currentColor" strokeWidth="1" className="text-border" />
                                                    </svg>
                                                </div>
                                            </>
                                        )}

                                    {isFile ? (
                                        <FileText size={14} className={cn("opacity-40 shrink-0", isActive && "opacity-100 text-primary")} />
                                    ) : (
                                        <LayoutTemplate size={14} className={cn("opacity-40 shrink-0", isActive && "opacity-100 text-primary")} />
                                    )}
                                        {/* Hide extension in tabs too? User asked for sidebar, but tabs might be nice too. 
                                            User said: "Dont show the extension file of lies or templates"
                                            "file of lies" -> "file list" probably.
                                            Let's apply to tabs too for consistency.
                                        */}
                                        <span className="truncate flex-1 font-medium">
                                            {data.name.replace(/\.(md|json|mdt)$/, '')}
                                        </span>
                                        <button
                                            className={cn(
                                                "p-0.5 rounded-full hover:bg-muted transition-colors opacity-0 group-hover:opacity-100",
                                                isActive && "opacity-60"
                                            )}
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                closeTab(tab.id);
                                            }}
                                        >
                                            <X size={12} />
                                        </button>
                                    </div>
                                )
                            })}
                            {/* Filler line (after all tabs) */}
                            <div className="flex-1 h-full border-b border-border shrink-0" />
                        </div>

                        <div className="flex-1 min-h-0 relative flex flex-col">
                            {openTabs.length > 0 ? (
                                <div className="flex-1 h-full flex flex-col overflow-hidden">
                                    {children}
                                </div>
                            ) : (
                                <div className="flex items-center justify-center h-full text-muted-foreground bg-muted/5">
                                    <div className="text-center animate-in fade-in zoom-in duration-500">
                                        <div className="w-20 h-20 bg-muted/30 rounded-full flex items-center justify-center mx-auto mb-6">
                                            <FileText className="w-10 h-10 opacity-20" />
                                        </div>
                                        <h2 className="text-xl font-semibold text-foreground/40 mb-2">No active document</h2>
                                        <p className="text-sm opacity-50">Select or create a file to start writing</p>
                                    </div>
                                </div>
                            )}
                        </div>
                    </ResizablePanel>

                    {/* Right Sidebar (Export/Preview) */}
                    <ResizableHandle id="export-handle" />
                    <ResizablePanel
                        ref={rightPanelRef}
                        id="export-panel"
                        defaultSize={25}
                        minSize={15}
                        maxSize={40}
                        collapsible={true}
                        collapsedSize={3}
                        onCollapse={() => { if (rightSidebarExpanded) toggleRightSidebar(); }}
                        onExpand={() => { if (!rightSidebarExpanded) toggleRightSidebar(); }}
                    >
                        <ExportSidebar />
                    </ResizablePanel>
                </ResizablePanelGroup>
                <PrintStyles />
            </div >
        </DndProvider>
    );
}
