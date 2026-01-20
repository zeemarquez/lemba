"use client";

import { useStore } from "@/lib/store";
import { cn } from "@/lib/utils";
import { ChevronRight, ChevronDown } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useMemo, useState, useCallback } from "react";

export interface HeadingItem {
    id: string;
    text: string;
    level: number;
    line: number;
}

function parseHeadingsFromMarkdown(content: string): HeadingItem[] {
    if (!content) return [];
    
    const lines = content.split('\n');
    const headings: HeadingItem[] = [];
    let inCodeBlock = false;
    
    lines.forEach((line, index) => {
        // Track code blocks to avoid parsing headings inside them
        if (line.trim().startsWith('```')) {
            inCodeBlock = !inCodeBlock;
            return;
        }
        
        if (inCodeBlock) return;
        
        // Match ATX-style headings: # Heading, ## Heading, etc.
        const match = line.match(/^(#{1,6})\s+(.+)$/);
        if (match) {
            const level = match[1].length;
            const text = match[2].trim();
            headings.push({
                id: `heading-${index}`,
                text,
                level,
                line: index + 1, // 1-indexed line number
            });
        }
    });
    
    return headings;
}

// Check if a heading has any children (headings with higher level values that come after it)
function hasChildren(headings: HeadingItem[], index: number): boolean {
    const currentLevel = headings[index].level;
    for (let i = index + 1; i < headings.length; i++) {
        if (headings[i].level <= currentLevel) {
            // Found a sibling or parent level heading, stop
            return false;
        }
        if (headings[i].level > currentLevel) {
            // Found a child
            return true;
        }
    }
    return false;
}

interface OutlineItemProps {
    heading: HeadingItem;
    isActive?: boolean;
    isExpanded: boolean;
    hasChildren: boolean;
    onToggleExpand: () => void;
    onClick: () => void;
}

function OutlineItem({ heading, isActive, isExpanded, hasChildren, onToggleExpand, onClick }: OutlineItemProps) {
    // Calculate indentation based on heading level
    const paddingLeft = (heading.level - 1) * 12;
    
    const handleChevronClick = (e: React.MouseEvent) => {
        e.stopPropagation();
        if (hasChildren) {
            onToggleExpand();
        }
    };
    
    return (
        <button
            onClick={onClick}
            className={cn(
                "w-full text-left px-2 py-1.5 text-xs rounded-md transition-colors",
                "hover:bg-accent/50 focus:bg-accent/50 focus:outline-none",
                "flex items-center gap-1.5 min-h-[28px]",
                isActive && "bg-accent text-accent-foreground"
            )}
            style={{ paddingLeft: `${paddingLeft + 8}px` }}
            title={`Line ${heading.line}: ${heading.text}`}
        >
            <span 
                onClick={handleChevronClick}
                className={cn(
                    "shrink-0 flex items-center justify-center w-[14px] h-[14px]",
                    hasChildren && "cursor-pointer hover:bg-accent/50 rounded"
                )}
            >
                {hasChildren ? (
                    isExpanded ? (
                        <ChevronDown size={14} className="text-muted-foreground" />
                    ) : (
                        <ChevronRight size={14} className="text-muted-foreground" />
                    )
                ) : (
                    <ChevronRight size={14} className="text-muted-foreground/40" />
                )}
            </span>
            <span className="truncate">{heading.text}</span>
        </button>
    );
}

interface DocumentOutlineProps {
    className?: string;
    isCollapsed?: boolean;
    onToggleCollapse?: () => void;
}

export function DocumentOutline({ className, isCollapsed, onToggleCollapse }: DocumentOutlineProps) {
    const { files, activeFileId, currentView } = useStore();
    // Track which headings are collapsed (by their id)
    const [collapsedHeadings, setCollapsedHeadings] = useState<Set<string>>(new Set());
    
    // Get the active file content
    const activeFile = useMemo(() => {
        if (currentView !== 'file' || !activeFileId) return null;
        return files.find(f => f.id === activeFileId);
    }, [files, activeFileId, currentView]);
    
    // Parse headings from the markdown content
    const headings = useMemo(() => {
        if (!activeFile?.content) return [];
        return parseHeadingsFromMarkdown(activeFile.content);
    }, [activeFile?.content]);
    
    // Calculate which headings should be visible based on collapsed state
    const visibleHeadings = useMemo(() => {
        const visible: { heading: HeadingItem; index: number }[] = [];
        let skipUntilLevel = -1;
        
        for (let i = 0; i < headings.length; i++) {
            const heading = headings[i];
            
            // If we're skipping children of a collapsed heading
            if (skipUntilLevel !== -1) {
                if (heading.level <= skipUntilLevel) {
                    // Found a sibling or parent, stop skipping
                    skipUntilLevel = -1;
                } else {
                    // Still a child of collapsed heading, skip it
                    continue;
                }
            }
            
            visible.push({ heading, index: i });
            
            // If this heading is collapsed, start skipping its children
            if (collapsedHeadings.has(heading.id)) {
                skipUntilLevel = heading.level;
            }
        }
        
        return visible;
    }, [headings, collapsedHeadings]);
    
    const toggleHeadingCollapse = useCallback((headingId: string) => {
        setCollapsedHeadings(prev => {
            const next = new Set(prev);
            if (next.has(headingId)) {
                next.delete(headingId);
            } else {
                next.add(headingId);
            }
            return next;
        });
    }, []);
    
    const handleHeadingClick = (heading: HeadingItem) => {
        // Dispatch a custom event that editors can listen to for navigation
        const event = new CustomEvent('navigate-to-line', {
            detail: { line: heading.line, headingId: heading.id }
        });
        window.dispatchEvent(event);
    };
    
    // Show placeholder when no file is active
    if (currentView !== 'file' || !activeFileId) {
        return (
            <div className={cn("flex flex-col", className)}>
                <div 
                    className="flex items-center justify-between px-3 py-2 cursor-pointer hover:bg-accent/30"
                    onClick={onToggleCollapse}
                >
                    <div className="flex items-center gap-2">
                        {isCollapsed ? (
                            <ChevronRight size={14} className="text-muted-foreground" />
                        ) : (
                            <ChevronDown size={14} className="text-muted-foreground" />
                        )}
                        <span className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground">
                            Outline
                        </span>
                    </div>
                </div>
                {!isCollapsed && (
                    <div className="px-3 py-4 text-xs text-muted-foreground text-center">
                        No file open
                    </div>
                )}
            </div>
        );
    }
    
    return (
        <div className={cn("flex flex-col", className)}>
            <div 
                className="flex items-center justify-between px-3 py-2 cursor-pointer hover:bg-accent/30"
                onClick={onToggleCollapse}
            >
                <div className="flex items-center gap-2">
                    {isCollapsed ? (
                        <ChevronRight size={14} className="text-muted-foreground" />
                    ) : (
                        <ChevronDown size={14} className="text-muted-foreground" />
                    )}
                    <span className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground">
                        Outline
                    </span>
                </div>
                {headings.length > 0 && (
                    <span className="text-[10px] text-muted-foreground/60">
                        {headings.length}
                    </span>
                )}
            </div>
            
            {!isCollapsed && (
                <>
                    {headings.length === 0 ? (
                        <div className="px-3 py-4 text-xs text-muted-foreground text-center">
                            No headings found
                        </div>
                    ) : (
                        <ScrollArea className="flex-1">
                            <div className="px-1 pb-2 space-y-0.5">
                                {visibleHeadings.map(({ heading, index }) => (
                                    <OutlineItem
                                        key={heading.id}
                                        heading={heading}
                                        hasChildren={hasChildren(headings, index)}
                                        isExpanded={!collapsedHeadings.has(heading.id)}
                                        onToggleExpand={() => toggleHeadingCollapse(heading.id)}
                                        onClick={() => handleHeadingClick(heading)}
                                    />
                                ))}
                            </div>
                        </ScrollArea>
                    )}
                </>
            )}
        </div>
    );
}
