"use client";

import { useStore } from "@/lib/store";
import { PlateEditor } from "@/components/plate-editor/plate-editor";
import { InlineDiffOverlay } from "@/components/agent";
import { FileText } from "lucide-react";
import { debounce } from "lodash";
import { useMemo, useEffect, useState } from "react";
import { clearMarkdownCache } from "@/lib/markdown-processor";
import { useVersionHistory } from "@/hooks/use-version-history";
import { Button } from "@/components/ui/button";
import { DocumentDiff, formatDiffForDisplay, generateDiff } from "@/lib/agent";
import { WysiwygDiffOverlay } from "@/components/agent/WysiwygDiffOverlay";

function formatVersionTimeAgo(createdAt?: number): string {
    if (createdAt == null) return "Older version";
    const seconds = Math.floor((Date.now() - createdAt) / 1000);
    if (seconds < 60) return "Just now";
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes} min ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours} hr ago`;
    const days = Math.floor(hours / 24);
    if (days < 7) return `${days} day${days > 1 ? "s" : ""} ago`;
    return new Date(createdAt).toLocaleDateString();
}

export function EditorContainer() {
    const {
        activeFileId,
        files,
        updateFileContent,
        saveFile,
        pendingDiffs,
        editorViewMode
    } = useStore();

    const safeFiles = Array.isArray(files) ? files : [];
    const activeFile = safeFiles.find((f) => f.id === activeFileId);
    const [pendingVersion, setPendingVersion] = useState<{
        fileId: string;
        content: string;
        label: string;
        createdAt?: number;
    } | null>(null);
    const [previewDiff, setPreviewDiff] = useState<DocumentDiff | null>(null);

    // Check if there are pending diffs for the current file
    const hasPendingDiffs = useMemo(() => {
        if (!activeFileId) return false;
        return Object.values(pendingDiffs).some(
            d => d.fileId === activeFileId && d.status === 'pending'
        );
    }, [pendingDiffs, activeFileId]);

    // Create a debounced save function
    const debouncedSave = useMemo(
        () => debounce((id: string, content: string) => {
            saveFile(id, content);
        }, 1000),
        [saveFile]
    );

    // Cleanup debounce on unmount
    useEffect(() => {
        return () => {
            debouncedSave.cancel();
        };
    }, [debouncedSave]);

    // Clear markdown cache when switching files to prevent cross-file cache pollution
    useEffect(() => {
        clearMarkdownCache();
    }, [activeFile?.id]);

    // Automatic version history on significant changes or every 5 minutes
    useVersionHistory(activeFile?.id ?? null, activeFile?.content ?? "");

    useEffect(() => {
        const handlePreview = (event: CustomEvent<{ fileId: string; content: string; label: string; createdAt?: number }>) => {
            const detail = event.detail;
            if (!detail || !activeFileId || detail.fileId !== activeFileId) return;
            const currentFile = safeFiles.find((f) => f.id === activeFileId);
            const currentContent = currentFile?.content ?? "";
            const diff = generateDiff(
                activeFileId,
                currentFile?.name ?? activeFileId.split("/").pop() ?? activeFileId,
                currentContent,
                detail.content,
                `Version ${detail.label}`
            );
            setPendingVersion({
                fileId: detail.fileId,
                content: detail.content,
                label: detail.label,
                createdAt: detail.createdAt,
            });
            setPreviewDiff(diff);
        };
        window.addEventListener('version-preview', handlePreview as EventListener);
        return () => {
            window.removeEventListener('version-preview', handlePreview as EventListener);
        };
    }, [activeFileId]);

    useEffect(() => {
        if (pendingVersion && activeFileId && pendingVersion.fileId !== activeFileId) {
            setPendingVersion(null);
            setPreviewDiff(null);
        }
    }, [pendingVersion, activeFileId]);

    useEffect(() => {
        const handleCancel = () => {
            setPendingVersion(null);
            setPreviewDiff(null);
        };
        window.addEventListener('version-preview-cancel', handleCancel as EventListener);
        window.addEventListener('version-restored', handleCancel as EventListener);
        return () => {
            window.removeEventListener('version-preview-cancel', handleCancel as EventListener);
            window.removeEventListener('version-restored', handleCancel as EventListener);
        };
    }, []);

    if (!activeFile) {
        return (
            <div className="h-full flex flex-col items-center justify-center text-muted-foreground p-8 bg-muted/5">
                <FileText className="h-16 w-16 mb-4 opacity-10" />
                <p className="text-sm font-medium opacity-50">Select a file from the explorer to start editing</p>
            </div>
        );
    }

    return (
        <div className="h-full flex flex-col relative w-full bg-background overflow-hidden">
            {pendingVersion && (
                <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-[100] pointer-events-auto">
                    <div className="flex items-center gap-2 rounded-full border bg-background/95 shadow-sm px-3 py-1.5 text-xs">
                        <span className="text-muted-foreground">
                            {formatVersionTimeAgo(pendingVersion.createdAt)}
                        </span>
                        <Button
                            size="sm"
                            className="h-7 px-3"
                            onClick={async () => {
                                if (!pendingVersion || !activeFileId) return;
                                updateFileContent(activeFileId, pendingVersion.content);
                                await saveFile(activeFileId, pendingVersion.content);
                                setPendingVersion(null);
                                window.dispatchEvent(new CustomEvent('version-restored'));
                            }}
                        >
                            Restore version
                        </Button>
                        <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 px-3"
                            onClick={() => {
                                setPendingVersion(null);
                                setPreviewDiff(null);
                                window.dispatchEvent(new CustomEvent('version-preview-cancel'));
                            }}
                        >
                            Cancel
                        </Button>
                    </div>
                </div>
            )}
            {previewDiff && (
                editorViewMode !== 'source' ? (
                    <WysiwygDiffOverlay diff={previewDiff} />
                ) : (
                    <VersionSourceDiffView diff={previewDiff} />
                )
            )}
            <PlateEditor
                key={activeFile.id}
                content={activeFile.content}
                onChange={(val: string) => {
                    updateFileContent(activeFile.id, val);
                    debouncedSave(activeFile.id, val);
                }}
            />
            
            {/* Inline diff overlay when there are pending changes */}
            {hasPendingDiffs && activeFileId && (
                <InlineDiffOverlay fileId={activeFileId} />
            )}
        </div>
    );
}

function VersionSourceDiffView({ diff }: { diff: DocumentDiff }) {
    const formattedLines = formatDiffForDisplay(diff.originalContent, diff.proposedContent, 0, true);
    const lineStyles: Record<string, string> = {
        context: "bg-muted/5 text-muted-foreground",
        unchanged: "bg-muted/5",
        addition: "bg-green-500/15 text-green-800 dark:text-green-300",
        deletion: "bg-red-500/15 text-red-800 dark:text-red-300 line-through",
    };
    return (
        <div className="absolute inset-0 z-50 overflow-auto pointer-events-auto bg-background">
            <div className="font-mono text-sm leading-relaxed">
                {formattedLines.map((line, index) => (
                    <div key={index} className={`flex min-h-[1.75rem] ${lineStyles[line.type] ?? ""}`}>
                        <div className="w-8 text-center shrink-0 leading-7 font-bold text-muted-foreground/60">
                            {line.type === "addition" ? "+" : line.type === "deletion" ? "−" : ""}
                        </div>
                        <div className="flex-1 whitespace-pre-wrap break-words leading-7 pr-4">
                            {line.content || " "}
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}
