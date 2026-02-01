"use client";

import React, { useMemo, useRef, useEffect } from "react";
import { useStore } from "@/lib/store";
import { DocumentDiff, formatDiffForDisplay } from "@/lib/agent";
import { cn } from "@/lib/utils";
import { WysiwygDiffOverlay } from "./WysiwygDiffOverlay";

interface InlineDiffOverlayProps {
    fileId: string;
}

export function InlineDiffOverlay({ fileId }: InlineDiffOverlayProps) {
    const { getMergedPendingDiffs, pendingDiffs, editorViewMode } = useStore();

    const mergedDiff = useMemo(() => {
        const merged = getMergedPendingDiffs();
        return merged[fileId] ?? null;
    }, [getMergedPendingDiffs, fileId, pendingDiffs]);

    if (!mergedDiff) {
        return null;
    }

    // Use WYSIWYG diff view for editing/viewing modes, source diff view for source mode
    if (editorViewMode !== 'source') {
        return <WysiwygDiffOverlay diff={mergedDiff} />;
    }

    return <SourceDiffView diff={mergedDiff} />;
}

interface SourceDiffViewProps {
    diff: DocumentDiff;
}

/** Full document with diffs highlighted. Accept/Reject only in chat. */
function SourceDiffView({ diff }: SourceDiffViewProps) {
    const formattedLines = formatDiffForDisplay(diff.originalContent, diff.proposedContent, 0, true);
    const lastChangeRef = useRef<HTMLDivElement | null>(null);

    // Index of the last addition/deletion (scroll here when diff is shown)
    const lastChangedIndex = useMemo(() => {
        let last = -1;
        formattedLines.forEach((line, i) => {
            if (line.type === "addition" || line.type === "deletion") last = i;
        });
        return last;
    }, [formattedLines]);

    useEffect(() => {
        if (lastChangedIndex < 0) return;
        const el = lastChangeRef.current;
        if (el) {
            el.scrollIntoView({ behavior: "smooth", block: "center" });
        }
    }, [lastChangedIndex, diff.id]);

    return (
        <div className="absolute inset-0 z-50 overflow-auto pointer-events-auto bg-background">
            <div className="font-mono text-sm leading-relaxed">
                {formattedLines.map((line, index) => (
                    <InlineDiffLine
                        key={index}
                        line={line}
                        ref={index === lastChangedIndex ? lastChangeRef : undefined}
                    />
                ))}
            </div>
        </div>
    );
}

interface InlineDiffLineProps {
    line: {
        type: "context" | "addition" | "deletion" | "unchanged";
        content: string;
        oldLineNumber?: number;
        newLineNumber?: number;
    };
}

const InlineDiffLine = React.forwardRef<HTMLDivElement, InlineDiffLineProps>(function InlineDiffLine({ line }, ref) {
    if (line.type === "context" && line.content === "...") {
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

    const lineNumber = line.type === "deletion" ? line.oldLineNumber : line.newLineNumber;

    return (
        <div
            ref={ref}
            className={cn(
                "flex min-h-[1.75rem]",
                lineStyles[line.type],
                borderStyles[line.type]
            )}
        >
            <div className="w-14 pr-3 text-right text-muted-foreground/40 select-none shrink-0 text-xs leading-7 bg-muted/30">
                {lineNumber ?? ""}
            </div>
            <div className="w-8 text-center shrink-0 leading-7 font-bold">
                {line.type === "addition" && (
                    <span className="text-green-600 dark:text-green-400">+</span>
                )}
                {line.type === "deletion" && (
                    <span className="text-red-600 dark:text-red-400">−</span>
                )}
            </div>
            <div
                className={cn(
                    "flex-1 whitespace-pre-wrap break-words leading-7 pr-4",
                    textStyles[line.type]
                )}
            >
                {line.content || " "}
            </div>
        </div>
    );
});
