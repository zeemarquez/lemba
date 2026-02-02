"use client";

import { useMemo, useState, useEffect, useRef, KeyboardEvent } from "react";
import { useStore, FileNode } from "@/lib/store";
import { cn } from "@/lib/utils";
import { ScrollArea } from "@/components/ui/scroll-area";
import { FileText, Folder, Search } from "lucide-react";

interface FileMentionSelectorProps {
    query: string;
    onSelect: (fileId: string) => void;
    onClose: () => void;
}

export function FileMentionSelector({ query, onSelect, onClose }: FileMentionSelectorProps) {
    const { fileTree } = useStore();
    const [selectedIndex, setSelectedIndex] = useState(0);
    const listRef = useRef<HTMLDivElement>(null);

    // Flatten file tree to get all files
    const allFiles = useMemo(() => {
        const files: { id: string; name: string; path: string }[] = [];
        
        const traverse = (nodes: FileNode[], parentPath: string = "") => {
            for (const node of nodes) {
                const currentPath = parentPath ? `${parentPath}/${node.name}` : node.name;
                
                if (node.type === 'file') {
                    files.push({
                        id: node.id,
                        name: node.name,
                        path: currentPath,
                    });
                } else if (node.children) {
                    traverse(node.children, currentPath);
                }
            }
        };
        
        traverse(fileTree);
        return files;
    }, [fileTree]);

    // Filter files based on query
    const filteredFiles = useMemo(() => {
        if (!query) return allFiles.slice(0, 10);
        
        const lowerQuery = query.toLowerCase();
        return allFiles
            .filter(file => 
                file.name.toLowerCase().includes(lowerQuery) ||
                file.path.toLowerCase().includes(lowerQuery)
            )
            .slice(0, 10);
    }, [allFiles, query]);

    // Reset selection when filtered list changes
    useEffect(() => {
        setSelectedIndex(0);
    }, [filteredFiles]);

    // Scroll selected item into view
    useEffect(() => {
        const list = listRef.current;
        if (list) {
            const selectedElement = list.querySelector(`[data-index="${selectedIndex}"]`);
            selectedElement?.scrollIntoView({ block: 'nearest' });
        }
    }, [selectedIndex]);

    // Handle keyboard navigation
    useEffect(() => {
        const handleKeyDown = (e: globalThis.KeyboardEvent) => {
            switch (e.key) {
                case 'ArrowDown':
                    e.preventDefault();
                    setSelectedIndex(i => Math.min(i + 1, filteredFiles.length - 1));
                    break;
                case 'ArrowUp':
                    e.preventDefault();
                    setSelectedIndex(i => Math.max(i - 1, 0));
                    break;
                case 'Enter':
                    e.preventDefault();
                    if (filteredFiles[selectedIndex]) {
                        onSelect(filteredFiles[selectedIndex].id);
                    }
                    break;
                case 'Escape':
                    e.preventDefault();
                    onClose();
                    break;
            }
        };

        document.addEventListener('keydown', handleKeyDown);
        return () => document.removeEventListener('keydown', handleKeyDown);
    }, [filteredFiles, selectedIndex, onSelect, onClose]);

    if (filteredFiles.length === 0) {
        return (
            <div className="rounded-md border bg-popover shadow-md p-3">
                <div className="flex items-center gap-2 text-muted-foreground text-sm">
                    <Search size={14} />
                    <span>No files found</span>
                </div>
            </div>
        );
    }

    return (
        <div className="rounded-md border bg-popover shadow-md overflow-hidden">
            <div className="px-3 py-2 border-b bg-muted/30">
                <div className="flex items-center gap-2 text-muted-foreground text-xs">
                    <Search size={12} />
                    <span>Files {query && `matching "${query}"`}</span>
                </div>
            </div>
            
            <ScrollArea className="max-h-[200px]">
                <div ref={listRef} className="py-1">
                    {filteredFiles.map((file, index) => (
                        <button
                            key={file.id}
                            data-index={index}
                            onClick={() => onSelect(file.id)}
                            onMouseEnter={() => setSelectedIndex(index)}
                            className={cn(
                                "w-full flex items-center gap-2 px-3 py-2 text-sm text-left",
                                "hover:bg-accent transition-colors",
                                index === selectedIndex && "bg-accent"
                            )}
                        >
                            <FileText size={14} className="shrink-0 text-muted-foreground" />
                            <div className="flex-1 min-w-0">
                                <div className="font-medium truncate">{file.name}</div>
                                <div className="text-xs text-muted-foreground truncate">
                                    {file.path}
                                </div>
                            </div>
                        </button>
                    ))}
                </div>
            </ScrollArea>

            <div className="px-3 py-1.5 border-t bg-muted/30 text-[10px] text-muted-foreground">
                <kbd className="px-1 py-0.5 rounded bg-background">↑↓</kbd> to navigate, 
                <kbd className="px-1 py-0.5 rounded bg-background ml-1">Enter</kbd> to select, 
                <kbd className="px-1 py-0.5 rounded bg-background ml-1">Esc</kbd> to close
            </div>
        </div>
    );
}
