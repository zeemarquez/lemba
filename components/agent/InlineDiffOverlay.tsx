"use client";

import React, { useMemo, useRef, useEffect } from "react";
import { useStore } from "@/lib/store";
import { DocumentDiff, FormattedLine, formatDiffForDisplay } from "@/lib/agent";
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

    if (editorViewMode !== 'source') {
        return <WysiwygDiffOverlay diff={mergedDiff} />;
    }

    return <SourceDiffView diff={mergedDiff} />;
}

interface SourceDiffViewProps {
    diff: DocumentDiff;
}

/**
 * Full document with diffs highlighted. Accept/Reject happens in the chat
 * panel; this overlay is read-only. When the diff carries word-level
 * annotations (`wordRanges`), we highlight only those character ranges so a
 * single-word rename is not a sea of red/green.
 */
function SourceDiffView({ diff }: SourceDiffViewProps) {
    const formattedLines = useMemo(
        () => formatDiffForDisplay(diff.originalContent, diff.proposedContent, 0, true),
        [diff.originalContent, diff.proposedContent],
    );
    const lastChangeRef = useRef<HTMLDivElement | null>(null);

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
    line: FormattedLine;
}

const InlineDiffLine = React.forwardRef<HTMLDivElement, InlineDiffLineProps>(function InlineDiffLine({ line }, ref) {
    if (line.type === "context" && line.content === "...") {
        return (
            <div className="py-2 text-muted-foreground/50 text-center border-y border-dashed border-muted/50 bg-muted/20">
                <span className="text-xs">···</span>
            </div>
        );
    }

    const hasWordRanges = (line.wordRanges?.length ?? 0) > 0;

    const lineStyles = {
        context: "bg-muted/5",
        unchanged: "bg-muted/5",
        // When we have word-level ranges, tone down the full-line background
        // so the highlighted tokens stand out instead of drowning in color.
        addition: hasWordRanges
            ? "bg-green-500/5 dark:bg-green-500/5"
            : "bg-green-500/15 dark:bg-green-500/10",
        deletion: hasWordRanges
            ? "bg-red-500/5 dark:bg-red-500/5"
            : "bg-red-500/15 dark:bg-red-500/10",
    } as const;

    const textStyles = {
        context: "text-muted-foreground",
        unchanged: "",
        addition: "text-green-800 dark:text-green-300",
        deletion: hasWordRanges
            ? "text-red-800 dark:text-red-300"
            : "text-red-800 dark:text-red-300 line-through",
    } as const;

    const borderStyles = {
        context: "",
        unchanged: "",
        addition: "border-l-2 border-green-500",
        deletion: "border-l-2 border-red-500",
    } as const;

    const lineNumber = line.type === "deletion" ? line.oldLineNumber : line.newLineNumber;

    return (
        <div
            ref={ref}
            className={cn(
                "flex min-h-[1.75rem]",
                lineStyles[line.type],
                borderStyles[line.type],
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
                    textStyles[line.type],
                )}
            >
                <InlineLineContent line={line} />
            </div>
        </div>
    );
});

function InlineLineContent({ line }: { line: FormattedLine }) {
    const content = line.content || " ";
    const ranges = line.wordRanges ?? [];
    if (ranges.length === 0) {
        return <>{content}</>;
    }

    const sorted = [...ranges].sort((a, b) => a.start - b.start);
    const segments: React.ReactNode[] = [];
    let cursor = 0;
    for (let i = 0; i < sorted.length; i++) {
        const r = sorted[i];
        const start = Math.max(r.start, cursor);
        const end = Math.min(r.end, content.length);
        if (start > cursor) {
            segments.push(<span key={`u-${i}`}>{content.slice(cursor, start)}</span>);
        }
        if (end > start) {
            segments.push(
                <mark
                    key={`h-${i}`}
                    className={cn(
                        "rounded px-0.5",
                        line.type === "deletion"
                            ? "bg-red-500/30 text-red-900 dark:text-red-200 line-through"
                            : "bg-green-500/30 text-green-900 dark:text-green-200",
                    )}
                >
                    {content.slice(start, end)}
                </mark>,
            );
        }
        cursor = end;
    }
    if (cursor < content.length) {
        segments.push(<span key="tail">{content.slice(cursor)}</span>);
    }
    return <>{segments}</>;
}
