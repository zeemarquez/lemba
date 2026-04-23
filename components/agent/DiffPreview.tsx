"use client";

import { useState, useMemo } from "react";
import {
    DocumentDiff,
    FormattedLine,
    HunkKind,
    formatDiffForDisplay,
    calculateDiffStats,
} from "@/lib/agent";
import { useStore } from "@/lib/store";
import { cn } from "@/lib/utils";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
    ChevronDown,
    ChevronRight,
    FileText,
    Plus,
    Minus,
    Check,
    X,
    AlertTriangle,
    Pencil,
    Type,
    Heading as HeadingIcon,
    FilePlus,
    FileMinus,
    AlignLeft,
} from "lucide-react";

interface DiffPreviewProps {
    diff: DocumentDiff;
    compact?: boolean;
}

const HUNK_KIND_LABEL: Record<HunkKind, string> = {
    typo: "Typo",
    prose_edit: "Prose edit",
    section_edit: "Section",
    insert_block: "Insert",
    delete_block: "Delete",
    format: "Formatting",
};

function HunkKindIcon({ kind, size = 12 }: { kind?: HunkKind; size?: number }) {
    const cls = "text-muted-foreground/70 shrink-0";
    switch (kind) {
        case "typo":
            return <Type size={size} className={cls} aria-label={HUNK_KIND_LABEL.typo} />;
        case "prose_edit":
            return <Pencil size={size} className={cls} aria-label={HUNK_KIND_LABEL.prose_edit} />;
        case "section_edit":
            return <HeadingIcon size={size} className={cls} aria-label={HUNK_KIND_LABEL.section_edit} />;
        case "insert_block":
            return <FilePlus size={size} className={cls} aria-label={HUNK_KIND_LABEL.insert_block} />;
        case "delete_block":
            return <FileMinus size={size} className={cls} aria-label={HUNK_KIND_LABEL.delete_block} />;
        case "format":
            return <AlignLeft size={size} className={cls} aria-label={HUNK_KIND_LABEL.format} />;
        default:
            return null;
    }
}

/**
 * Group formatted lines by hunk index so we can render per-hunk accept/reject
 * controls and visually separate each hunk.
 */
interface HunkGroup {
    hunkIndex: number | null; // null for unchanged / context lines
    kind?: HunkKind;
    lines: FormattedLine[];
}

function groupByHunk(lines: FormattedLine[]): HunkGroup[] {
    const groups: HunkGroup[] = [];
    let current: HunkGroup | null = null;
    for (const line of lines) {
        const key = line.hunkIndex ?? null;
        if (!current || current.hunkIndex !== key) {
            current = { hunkIndex: key, kind: line.hunkKind, lines: [] };
            groups.push(current);
        }
        current.lines.push(line);
    }
    return groups;
}

export function DiffPreview({ diff, compact = false }: DiffPreviewProps) {
    const [isExpanded, setIsExpanded] = useState(false);
    const { acceptHunk, rejectHunk } = useStore();

    const stats = calculateDiffStats(diff);
    const hasConflicts = (diff.conflicts?.length ?? 0) > 0;

    const formattedLines = useMemo(
        () =>
            formatDiffForDisplay(
                diff.originalContent,
                diff.proposedContent,
                isExpanded ? 1 : 2,
                false,
            ),
        [diff.originalContent, diff.proposedContent, isExpanded],
    );

    const hunkGroups = useMemo(() => groupByHunk(formattedLines), [formattedLines]);

    const statusColors = {
        pending: "border-amber-500/50 bg-amber-500/5",
        approved: "border-green-500/50 bg-green-500/5",
        rejected: "border-red-500/50 bg-red-500/5",
    };

    if (compact) {
        return (
            <div
                className={cn(
                    "flex items-center gap-2 px-2 py-1.5 rounded text-xs",
                    statusColors[diff.status],
                )}
            >
                <FileText size={12} className="text-muted-foreground shrink-0" />
                <span className="flex-1 truncate font-medium">{diff.fileName}</span>
                {hasConflicts && (
                    <AlertTriangle
                        size={12}
                        className="text-amber-500 shrink-0"
                        aria-label="Some edits conflicted during merge"
                    />
                )}
                <span className="text-green-600 dark:text-green-400 flex items-center gap-0.5 shrink-0">
                    <Plus size={10} />
                    {stats.additions}
                </span>
                <span className="text-red-600 dark:text-red-400 flex items-center gap-0.5 shrink-0">
                    <Minus size={10} />
                    {stats.deletions}
                </span>
            </div>
        );
    }

    return (
        <div
            className={cn(
                "rounded-lg border overflow-hidden",
                statusColors[diff.status],
            )}
        >
            {/* Header */}
            <div
                className="px-2 py-1.5 cursor-pointer hover:bg-accent/30 flex items-center gap-2"
                onClick={() => setIsExpanded(!isExpanded)}
            >
                <button className="text-muted-foreground shrink-0" aria-label="Toggle diff preview">
                    {isExpanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                </button>

                <FileText size={12} className="text-muted-foreground shrink-0" />

                <div className="flex-1 min-w-0">
                    <div className="text-xs font-medium truncate flex items-center gap-1.5">
                        {diff.fileName}
                        {hasConflicts && (
                            <span
                                className="inline-flex items-center gap-0.5 text-[10px] text-amber-600 dark:text-amber-400"
                                title={`${diff.conflicts?.length} overlapping edits resolved by last-write-wins`}
                            >
                                <AlertTriangle size={10} />
                                {diff.conflicts?.length} conflict{diff.conflicts?.length === 1 ? "" : "s"}
                            </span>
                        )}
                    </div>
                    {diff.description && (
                        <div className="text-[10px] text-muted-foreground truncate">
                            {diff.description}
                        </div>
                    )}
                </div>

                <div className="flex items-center gap-1.5 text-[10px] shrink-0">
                    <span className="text-green-600 dark:text-green-400 flex items-center gap-0.5">
                        <Plus size={8} />
                        {stats.additions}
                    </span>
                    <span className="text-red-600 dark:text-red-400 flex items-center gap-0.5">
                        <Minus size={8} />
                        {stats.deletions}
                    </span>
                </div>
            </div>

            {isExpanded && (
                <div className="border-t">
                    <ScrollArea className="max-h-[320px]">
                        <div className="font-mono text-[10px] leading-tight">
                            {hunkGroups.map((group, groupIdx) => (
                                <HunkBlock
                                    key={`${groupIdx}-${group.hunkIndex ?? "ctx"}`}
                                    group={group}
                                    canAct={diff.status === "pending" && group.hunkIndex !== null}
                                    onAccept={
                                        group.hunkIndex !== null
                                            ? () => acceptHunk(diff.fileId, group.hunkIndex!)
                                            : undefined
                                    }
                                    onReject={
                                        group.hunkIndex !== null
                                            ? () => rejectHunk(diff.fileId, group.hunkIndex!)
                                            : undefined
                                    }
                                />
                            ))}
                        </div>
                    </ScrollArea>
                </div>
            )}
        </div>
    );
}

interface HunkBlockProps {
    group: HunkGroup;
    canAct: boolean;
    onAccept?: () => void;
    onReject?: () => void;
}

function HunkBlock({ group, canAct, onAccept, onReject }: HunkBlockProps) {
    const isChangeBlock = group.hunkIndex !== null;

    return (
        <div
            className={cn(
                isChangeBlock && "border-b border-border/40 last:border-b-0 bg-muted/10",
            )}
        >
            {isChangeBlock && (
                <div className="flex items-center gap-1.5 px-2 py-1 text-[10px] text-muted-foreground border-b border-border/30 bg-muted/20">
                    <HunkKindIcon kind={group.kind} size={10} />
                    <span className="flex-1">
                        {group.kind ? HUNK_KIND_LABEL[group.kind] : "Change"}
                    </span>
                    {canAct && (
                        <div className="flex items-center gap-1">
                            <button
                                onClick={(e) => {
                                    e.stopPropagation();
                                    onReject?.();
                                }}
                                className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded hover:bg-red-500/20 text-red-600 dark:text-red-400"
                                title="Reject this change"
                            >
                                <X size={10} />
                                Reject
                            </button>
                            <button
                                onClick={(e) => {
                                    e.stopPropagation();
                                    onAccept?.();
                                }}
                                className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded hover:bg-green-500/20 text-green-600 dark:text-green-400"
                                title="Accept this change"
                            >
                                <Check size={10} />
                                Accept
                            </button>
                        </div>
                    )}
                </div>
            )}

            {group.lines.map((line, i) => (
                <DiffLine key={i} line={line} />
            ))}
        </div>
    );
}

interface DiffLineProps {
    line: FormattedLine;
}

/**
 * Render a line of diff content. When `line.wordRanges` is present, we
 * highlight only those character ranges to show intra-line changes.
 */
function DiffLine({ line }: DiffLineProps) {
    if (line.type === "context" && line.content === "...") {
        return (
            <div className="px-2 py-0.5 text-muted-foreground text-center bg-muted/30 text-[10px]">
                ···
            </div>
        );
    }

    const lineColors = {
        context: "text-muted-foreground",
        unchanged: "",
        addition: "bg-green-500/10 text-green-700 dark:text-green-400",
        deletion: "bg-red-500/10 text-red-700 dark:text-red-400 opacity-90",
    } as const;

    const linePrefix = {
        context: " ",
        unchanged: " ",
        addition: "+",
        deletion: "-",
    } as const;

    return (
        <div className={cn("flex min-w-0", lineColors[line.type])}>
            <div className="w-4 text-center select-none shrink-0 text-muted-foreground/70">
                {linePrefix[line.type]}
            </div>
            <div className="flex-1 px-1 py-px whitespace-pre-wrap break-all min-w-0">
                <LineWithHighlights line={line} />
            </div>
        </div>
    );
}

function LineWithHighlights({ line }: { line: FormattedLine }) {
    const content = line.content || " ";
    const ranges = line.wordRanges ?? [];
    if (ranges.length === 0) {
        return (
            <span
                className={cn(
                    line.type === "deletion" && "line-through",
                )}
            >
                {content}
            </span>
        );
    }

    // Sort and coalesce ranges defensively.
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
