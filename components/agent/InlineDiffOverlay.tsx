"use client";

import { useStore } from "@/lib/store";
import { DocumentDiff, formatDiffForDisplay } from "@/lib/agent";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Check, X } from "lucide-react";
import { useState, useMemo, useEffect, useCallback } from "react";

interface InlineDiffOverlayProps {
    fileId: string;
}

export function InlineDiffOverlay({ fileId }: InlineDiffOverlayProps) {
    const { pendingDiffs, approveDiff, rejectDiff } = useStore();
    const [isApproving, setIsApproving] = useState<string | null>(null);

    // Get pending diffs for this file
    const fileDiffs = useMemo(() => {
        return Object.values(pendingDiffs).filter(
            d => d.fileId === fileId && d.status === 'pending'
        );
    }, [pendingDiffs, fileId]);

    const handleApprove = useCallback(async (diffId: string) => {
        setIsApproving(diffId);
        try {
            await approveDiff(diffId);
        } finally {
            setIsApproving(null);
        }
    }, [approveDiff]);

    const handleReject = useCallback((diffId: string) => {
        rejectDiff(diffId);
    }, [rejectDiff]);

    // Keyboard shortcuts
    useEffect(() => {
        if (fileDiffs.length === 0) return;
        
        const currentDiff = fileDiffs[0]; // Handle first diff
        
        const handleKeyDown = (e: KeyboardEvent) => {
            // Cmd/Ctrl + Enter to accept
            if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
                e.preventDefault();
                handleApprove(currentDiff.id);
            }
            // Escape to reject
            if (e.key === 'Escape') {
                e.preventDefault();
                handleReject(currentDiff.id);
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [fileDiffs, handleApprove, handleReject]);

    if (fileDiffs.length === 0) {
        return null;
    }

    return (
        <div className="absolute inset-0 z-50 pointer-events-none">
            {fileDiffs.map(diff => (
                <InlineDiffView
                    key={diff.id}
                    diff={diff}
                    isApproving={isApproving === diff.id}
                    onApprove={() => handleApprove(diff.id)}
                    onReject={() => handleReject(diff.id)}
                />
            ))}
        </div>
    );
}

interface InlineDiffViewProps {
    diff: DocumentDiff;
    isApproving: boolean;
    onApprove: () => void;
    onReject: () => void;
}

function InlineDiffView({ diff, isApproving, onApprove, onReject }: InlineDiffViewProps) {
    const formattedLines = formatDiffForDisplay(diff.originalContent, diff.proposedContent, 0);

    return (
        <div className="absolute inset-0 overflow-auto pointer-events-auto bg-background">
            {/* Header bar with actions */}
            <div className="sticky top-0 z-10 bg-amber-500/10 border-b border-amber-500/30 px-4 py-3 flex items-center justify-between backdrop-blur-sm">
                <div className="flex items-center gap-3">
                    <div className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
                    <div>
                        <span className="text-sm font-medium">
                            {diff.description || 'AI suggested changes'}
                        </span>
                        <span className="text-xs text-muted-foreground ml-2">
                            in {diff.fileName}
                        </span>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={onReject}
                        className="h-8 text-xs gap-1.5 text-red-600 hover:text-red-700 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/50 border-red-200 dark:border-red-800"
                    >
                        <X size={14} />
                        Discard
                        <kbd className="ml-1 px-1 py-0.5 rounded bg-muted text-[10px] font-mono">Esc</kbd>
                    </Button>
                    <Button
                        size="sm"
                        onClick={onApprove}
                        disabled={isApproving}
                        className="h-8 text-xs gap-1.5 bg-green-600 hover:bg-green-700 text-white"
                    >
                        <Check size={14} />
                        {isApproving ? 'Applying...' : 'Accept'}
                        <kbd className="ml-1 px-1 py-0.5 rounded bg-green-700 text-[10px] font-mono">⌘↵</kbd>
                    </Button>
                </div>
            </div>

            {/* Diff content */}
            <div className="font-mono text-sm leading-relaxed">
                {formattedLines.map((line, index) => (
                    <InlineDiffLine key={index} line={line} />
                ))}
            </div>
        </div>
    );
}

interface InlineDiffLineProps {
    line: {
        type: 'context' | 'addition' | 'deletion' | 'unchanged';
        content: string;
        oldLineNumber?: number;
        newLineNumber?: number;
    };
}

function InlineDiffLine({ line }: InlineDiffLineProps) {
    // Context separator
    if (line.type === 'context' && line.content === '...') {
        return (
            <div className="py-2 text-muted-foreground/50 text-center border-y border-dashed border-muted/50 bg-muted/20">
                <span className="text-xs">···</span>
            </div>
        );
    }

    const lineStyles = {
        context: "bg-muted/5",
        unchanged: "bg-muted/5",
        addition: "bg-green-500/15 dark:bg-green-500/10",
        deletion: "bg-red-500/15 dark:bg-red-500/10",
    };

    const textStyles = {
        context: "text-muted-foreground",
        unchanged: "",
        addition: "text-green-800 dark:text-green-300",
        deletion: "text-red-800 dark:text-red-300 line-through",
    };

    const borderStyles = {
        context: "",
        unchanged: "",
        addition: "border-l-2 border-green-500",
        deletion: "border-l-2 border-red-500",
    };

    const lineNumber = line.type === 'deletion' ? line.oldLineNumber : line.newLineNumber;

    return (
        <div className={cn(
            "flex min-h-[1.75rem]",
            lineStyles[line.type],
            borderStyles[line.type]
        )}>
            {/* Line number gutter */}
            <div className="w-14 pr-3 text-right text-muted-foreground/40 select-none shrink-0 text-xs leading-7 bg-muted/30">
                {lineNumber || ''}
            </div>
            
            {/* Change indicator */}
            <div className="w-8 text-center shrink-0 leading-7 font-bold">
                {line.type === 'addition' && <span className="text-green-600 dark:text-green-400">+</span>}
                {line.type === 'deletion' && <span className="text-red-600 dark:text-red-400">−</span>}
            </div>
            
            {/* Content */}
            <div className={cn(
                "flex-1 whitespace-pre-wrap break-words leading-7 pr-4",
                textStyles[line.type]
            )}>
                {line.content || ' '}
            </div>
        </div>
    );
}
