"use client";

import { useState } from "react";
import { DocumentDiff, formatDiffForDisplay, calculateDiffStats } from "@/lib/agent";
import { cn } from "@/lib/utils";
import { ScrollArea } from "@/components/ui/scroll-area";
import { 
    ChevronDown, 
    ChevronRight, 
    FileText,
    Plus,
    Minus,
} from "lucide-react";

interface DiffPreviewProps {
    diff: DocumentDiff;
    compact?: boolean;
}

export function DiffPreview({ diff, compact = false }: DiffPreviewProps) {
    const [isExpanded, setIsExpanded] = useState(false);

    const stats = calculateDiffStats(diff);
    const formattedLines = formatDiffForDisplay(diff.originalContent, diff.proposedContent, 2);

    const statusColors = {
        pending: "border-amber-500/50 bg-amber-500/5",
        approved: "border-green-500/50 bg-green-500/5",
        rejected: "border-red-500/50 bg-red-500/5",
    };

    if (compact) {
        // Ultra-compact version for list display
        return (
            <div className={cn(
                "flex items-center gap-2 px-2 py-1.5 rounded text-xs",
                statusColors[diff.status]
            )}>
                <FileText size={12} className="text-muted-foreground shrink-0" />
                <span className="flex-1 truncate font-medium">{diff.fileName}</span>
                <span className="text-green-600 dark:text-green-400 flex items-center gap-0.5 shrink-0">
                    <Plus size={10} />{stats.additions}
                </span>
                <span className="text-red-600 dark:text-red-400 flex items-center gap-0.5 shrink-0">
                    <Minus size={10} />{stats.deletions}
                </span>
            </div>
        );
    }

    return (
        <div className={cn(
            "rounded-lg border overflow-hidden",
            statusColors[diff.status]
        )}>
            {/* Header */}
            <div 
                className="px-2 py-1.5 cursor-pointer hover:bg-accent/30 flex items-center gap-2"
                onClick={() => setIsExpanded(!isExpanded)}
            >
                <button className="text-muted-foreground shrink-0">
                    {isExpanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                </button>
                
                <FileText size={12} className="text-muted-foreground shrink-0" />
                
                <div className="flex-1 min-w-0">
                    <div className="text-xs font-medium truncate">{diff.fileName}</div>
                    {diff.description && (
                        <div className="text-[10px] text-muted-foreground truncate">
                            {diff.description}
                        </div>
                    )}
                </div>

                {/* Stats */}
                <div className="flex items-center gap-1.5 text-[10px] shrink-0">
                    <span className="text-green-600 dark:text-green-400 flex items-center gap-0.5">
                        <Plus size={8} />{stats.additions}
                    </span>
                    <span className="text-red-600 dark:text-red-400 flex items-center gap-0.5">
                        <Minus size={8} />{stats.deletions}
                    </span>
                </div>
            </div>

            {/* Expanded diff view */}
            {isExpanded && (
                <div className="border-t">
                    <ScrollArea className="max-h-[150px]">
                        <div className="font-mono text-[10px] leading-tight">
                            {formattedLines.map((line, index) => (
                                <DiffLine key={index} line={line} />
                            ))}
                        </div>
                    </ScrollArea>
                </div>
            )}
        </div>
    );
}

interface DiffLineProps {
    line: {
        type: 'context' | 'addition' | 'deletion' | 'unchanged';
        content: string;
        oldLineNumber?: number;
        newLineNumber?: number;
    };
}

function DiffLine({ line }: DiffLineProps) {
    const lineColors = {
        context: "text-muted-foreground",
        unchanged: "",
        addition: "bg-green-500/15 text-green-700 dark:text-green-400",
        deletion: "bg-red-500/15 text-red-700 dark:text-red-400 line-through opacity-70",
    };

    const linePrefix = {
        context: " ",
        unchanged: " ",
        addition: "+",
        deletion: "-",
    };

    // Context separator line
    if (line.type === 'context' && line.content === '...') {
        return (
            <div className="px-2 py-0.5 text-muted-foreground text-center bg-muted/30 text-[10px]">
                ···
            </div>
        );
    }

    return (
        <div className={cn(
            "flex min-w-0",
            lineColors[line.type]
        )}>
            {/* Prefix */}
            <div className="w-4 text-center select-none shrink-0 text-muted-foreground/70">
                {linePrefix[line.type]}
            </div>
            
            {/* Content */}
            <div className="flex-1 px-1 py-px whitespace-pre-wrap break-all min-w-0">
                {line.content || ' '}
            </div>
        </div>
    );
}
