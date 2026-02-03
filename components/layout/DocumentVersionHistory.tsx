"use client";

import { useStore } from "@/lib/store";
import { cn } from "@/lib/utils";
import { ChevronRight, ChevronDown, RefreshCw } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { useCallback, useEffect, useState } from "react";
import { getVersions } from "@/lib/version-history";
import type { VersionEntry } from "@/lib/browser-storage";
import { generateDiff, calculateDiffStats } from "@/lib/agent";

interface DocumentVersionHistoryProps {
    className?: string;
    isCollapsed?: boolean;
    onToggleCollapse?: () => void;
}

function formatRelativeTime(ms: number): string {
    const seconds = Math.floor((Date.now() - ms) / 1000);
    if (seconds < 60) return "Just now";
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes} min${minutes !== 1 ? "s" : ""} ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours} hr ago`;
    const days = Math.floor(hours / 24);
    if (days < 7) return `${days} day${days > 1 ? "s" : ""} ago`;
    return new Date(ms).toLocaleDateString();
}

function hashString(str: string): string {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        const char = str.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash;
    }
    return Math.abs(hash).toString(36);
}

function shortHash(entry: VersionEntry): string {
    const raw = entry.hash || hashString(entry.content || "");
    return raw.slice(0, 8);
}

/** Additions and deletions for a version vs current document content. */
function getVersionDiffStats(
    currentContent: string,
    versionContent: string,
    fileId: string,
    fileName: string
): { added: number; removed: number } {
    const diff = generateDiff(fileId, fileName, currentContent, versionContent, "");
    const stats = calculateDiffStats(diff);
    return { added: stats.additions, removed: stats.deletions };
}

export function DocumentVersionHistory({
    className,
    isCollapsed = false,
    onToggleCollapse,
}: DocumentVersionHistoryProps) {
    const { files, activeFileId, currentView } = useStore();
    const [versions, setVersions] = useState<VersionEntry[]>([]);
    const [loading, setLoading] = useState(false);
    const [selectedVersionId, setSelectedVersionId] = useState<string | null>(null);

    const loadVersions = useCallback(() => {
        if (!activeFileId || currentView !== "file") return;
        setLoading(true);
        getVersions(activeFileId)
            .then(setVersions)
            .finally(() => setLoading(false));
    }, [activeFileId, currentView]);

    useEffect(() => {
        if (!activeFileId || currentView !== "file") {
            setVersions([]);
            setSelectedVersionId(null);
            return;
        }
        loadVersions();
    }, [activeFileId, currentView, loadVersions]);

    useEffect(() => {
        const handleCancel = () => {
            setSelectedVersionId(null);
        };
        const handleRestored = () => {
            setSelectedVersionId(null);
            loadVersions();
        };
        window.addEventListener('version-preview-cancel', handleCancel as EventListener);
        window.addEventListener('version-restored', handleRestored as EventListener);
        return () => {
            window.removeEventListener('version-preview-cancel', handleCancel as EventListener);
            window.removeEventListener('version-restored', handleRestored as EventListener);
        };
    }, [loadVersions]);

    const handlePreview = (version: VersionEntry) => {
        if (!activeFileId || version.fileId !== activeFileId) return;
        setSelectedVersionId(version.id);
        window.dispatchEvent(
            new CustomEvent('version-preview', {
                detail: {
                    fileId: activeFileId,
                    content: version.content,
                    label: shortHash(version),
                    createdAt: version.createdAt,
                },
            })
        );
    };

    if (currentView !== "file" || !activeFileId) {
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
                            Version History
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
        <div className={cn("flex flex-col h-full", className)}>
            <div className="flex items-center justify-between px-3 py-2 shrink-0">
                <div
                    className="flex items-center gap-2 cursor-pointer hover:bg-accent/30 rounded px-1 py-0.5 -ml-1 flex-1"
                    onClick={onToggleCollapse}
                >
                    {isCollapsed ? (
                        <ChevronRight size={14} className="text-muted-foreground" />
                    ) : (
                        <ChevronDown size={14} className="text-muted-foreground" />
                    )}
                    <span className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground">
                        Version History
                    </span>
                </div>
                {!isCollapsed && activeFileId && (
                    <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 shrink-0"
                        onClick={(e) => {
                            e.stopPropagation();
                            loadVersions();
                        }}
                        title="Refresh versions"
                    >
                        <RefreshCw size={12} />
                    </Button>
                )}
            </div>

            {!isCollapsed && (
                <>
                    {loading ? (
                        <div className="px-3 py-4 text-xs text-muted-foreground text-center">
                            Loading...
                        </div>
                    ) : versions.length === 0 ? (
                        <div className="px-3 py-4 text-xs text-muted-foreground text-center">
                            No versions yet. Edit the document to create versions.
                        </div>
                    ) : (
                        <ScrollArea className="flex-1 min-h-0">
                            <div className="px-1 pb-2 space-y-1">
                                {versions.map((v) => {
                                    const isSelected = v.id === selectedVersionId;
                                    const currentContent = files.find((f) => f.id === activeFileId)?.content ?? "";
                                    const fileName = files.find((f) => f.id === activeFileId)?.name ?? activeFileId?.split("/").pop() ?? "";
                                    const { added, removed } = getVersionDiffStats(currentContent, v.content ?? "", activeFileId ?? "", fileName);
                                    return (
                                        <button
                                            key={v.id}
                                            onClick={() => handlePreview(v)}
                                            className={cn(
                                                "w-full text-left px-2 py-1.5 rounded-md transition-colors",
                                                "hover:bg-accent/50 focus:bg-accent/50 focus:outline-none",
                                                "flex items-center justify-between gap-2",
                                                isSelected && "bg-accent/50"
                                            )}
                                            title="Click to preview this version"
                                        >
                                            <span className="text-xs text-muted-foreground">
                                                {formatRelativeTime(v.createdAt)}
                                            </span>
                                            <span className="flex items-center gap-1.5 text-xs shrink-0">
                                                {added > 0 && (
                                                    <span className="text-green-600 dark:text-green-400 font-medium">
                                                        +{added}
                                                    </span>
                                                )}
                                                {removed > 0 && (
                                                    <span className="text-red-600 dark:text-red-400 font-medium">
                                                        −{removed}
                                                    </span>
                                                )}
                                                {added === 0 && removed === 0 && (
                                                    <span className="text-muted-foreground">—</span>
                                                )}
                                            </span>
                                        </button>
                                    );
                                })}
                            </div>
                        </ScrollArea>
                    )}
                </>
            )}
        </div>
    );
}
