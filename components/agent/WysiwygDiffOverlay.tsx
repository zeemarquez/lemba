"use client";

import React, { useMemo, useRef, useEffect } from "react";
import { DocumentDiff } from "@/lib/agent";
import { cn } from "@/lib/utils";
import { createPlateEditor } from "platejs/react";
import { EditorKit } from "@/components/plate-editor/editor-kit";
import { preprocessMathDelimiters, preprocessHtmlTables } from "@/components/plate-editor/plugins/markdown-kit";

// ==================== Plate node types ====================

interface PlateTextNode {
    text: string;
    bold?: boolean;
    italic?: boolean;
    underline?: boolean;
    strikethrough?: boolean;
    code?: boolean;
}

interface PlateElementNode {
    type: string;
    children?: PlateNode[];
    url?: string;
    alt?: string;
    texExpression?: string;
    variant?: string;
}

type PlateNode = PlateTextNode | PlateElementNode;

// ==================== Line grouping ====================

type LineType = "unchanged" | "deletion" | "addition";

interface LineInfo {
    content: string;
    type: LineType;
    /** 1-based line number in the proposed document (for unchanged / addition). */
    lineNumber?: number;
}

/**
 * A group of consecutive lines that share a type AND form a single
 * markdown block (e.g. a fenced code block, a table, an alert). Grouping
 * is important because deserializing one line at a time breaks rendering
 * for multi-line constructs: an unclosed fence, a table row without a
 * header, or a `$$ ... $$` equation spread across lines all need to be
 * fed to the markdown parser as a single unit.
 */
interface LineGroup {
    type: LineType;
    lines: LineInfo[];
    lineNumber?: number;
}

/**
 * Walk the lines and merge consecutive same-type lines into groups, closing
 * a group when the markdown block ends (code fence closes, blank line ends
 * a table / alert / equation).
 */
function groupLinesIntoBlocks(lines: LineInfo[]): LineGroup[] {
    const groups: LineGroup[] = [];
    let current: LineGroup | null = null;

    // State machine for multi-line constructs so we know when to close a group.
    let inCodeFence = false;
    let inEquation = false;

    const startNew = (line: LineInfo) => {
        current = {
            type: line.type,
            lines: [line],
            lineNumber: line.lineNumber,
        };
        groups.push(current);
    };

    const push = (line: LineInfo) => {
        if (!current || current.type !== line.type) {
            startNew(line);
            return;
        }
        current.lines.push(line);
    };

    for (const line of lines) {
        const text = line.content;
        const isFenceToggle = /^\s{0,3}```/.test(text);
        const isEquationToggle = /^\s*\$\$\s*$/.test(text);
        const isBlockquoteOrAlert = /^\s{0,3}>/.test(text);
        const isTableRow = /^\s*\|/.test(text);
        const isBlank = text.trim() === "";

        if (inCodeFence) {
            push(line);
            if (isFenceToggle) inCodeFence = false;
            continue;
        }
        if (inEquation) {
            push(line);
            if (isEquationToggle) inEquation = false;
            continue;
        }

        if (isFenceToggle) {
            // Open a code fence; subsequent lines stay in the same group even
            // if the type changes (partial code-block edits), but we keep it
            // simple: if the type differs we start a new group as usual.
            push(line);
            inCodeFence = true;
            continue;
        }

        if (isEquationToggle) {
            push(line);
            inEquation = true;
            continue;
        }

        if (isTableRow || isBlockquoteOrAlert) {
            push(line);
            continue;
        }

        if (isBlank) {
            // A blank line terminates any open "loose" block (table, alert).
            push(line);
            current = null; // next non-blank starts a fresh group
            continue;
        }

        push(line);
    }

    return groups;
}

// ==================== Component ====================

interface WysiwygDiffOverlayProps {
    diff: DocumentDiff;
}

/**
 * WYSIWYG Diff Overlay
 *
 * Renders the document with diffs inline: deletions struck through in red,
 * additions highlighted in green. Lines are grouped into markdown blocks
 * before rendering so multi-line constructs (code blocks, tables, alert
 * blocks, block equations) render correctly as a single unit.
 */
export function WysiwygDiffOverlay({ diff }: WysiwygDiffOverlayProps) {
    const lastChangeRef = useRef<HTMLDivElement | null>(null);

    const tempEditor = useMemo(() => {
        return createPlateEditor({ plugins: EditorKit });
    }, []);

    const { groups, lastChangedGroup } = useMemo(() => {
        const hunks = diff.hunks;
        const oldLines = diff.originalContent.split("\n");

        const lines: LineInfo[] = [];
        let oldLineNum = 1;
        let newLineNum = 1;

        for (const hunk of hunks) {
            while (oldLineNum < hunk.startLine && oldLineNum <= oldLines.length) {
                lines.push({
                    content: oldLines[oldLineNum - 1],
                    type: "unchanged",
                    lineNumber: newLineNum,
                });
                oldLineNum++;
                newLineNum++;
            }

            for (const line of hunk.oldLines) {
                lines.push({ content: line, type: "deletion" });
                oldLineNum++;
            }

            for (const line of hunk.newLines) {
                lines.push({ content: line, type: "addition", lineNumber: newLineNum });
                newLineNum++;
            }
        }

        while (oldLineNum <= oldLines.length) {
            lines.push({
                content: oldLines[oldLineNum - 1],
                type: "unchanged",
                lineNumber: newLineNum,
            });
            oldLineNum++;
            newLineNum++;
        }

        const grouped = groupLinesIntoBlocks(lines);
        let lastChanged = -1;
        grouped.forEach((g, i) => {
            if (g.type !== "unchanged") lastChanged = i;
        });
        return { groups: grouped, lastChangedGroup: lastChanged };
    }, [diff]);

    useEffect(() => {
        if (lastChangedGroup < 0) return;
        const el = lastChangeRef.current;
        if (el) {
            el.scrollIntoView({ behavior: "smooth", block: "center" });
        }
    }, [lastChangedGroup, diff.id]);

    const renderGroup = (group: LineGroup, index: number) => {
        const isLastChange = index === lastChangedGroup;
        const blockMarkdown = group.lines.map((l) => l.content).join("\n");

        let nodes: PlateNode[] = [];
        try {
            const preprocessed = preprocessHtmlTables(preprocessMathDelimiters(blockMarkdown));
            nodes = tempEditor.api.markdown.deserialize(preprocessed) as PlateNode[];
        } catch {
            nodes = [{ type: "p", children: [{ text: blockMarkdown }] }];
        }

        const groupStyles: Record<LineType, string> = {
            unchanged: "",
            addition: "bg-green-100/40 dark:bg-green-500/10 border-l-2 border-green-500",
            deletion: "bg-red-100/40 dark:bg-red-500/10 border-l-2 border-red-500 opacity-70",
        };

        const textStyles: Record<LineType, string> = {
            unchanged: "",
            addition: "text-green-800 dark:text-green-300",
            deletion: "text-red-800 dark:text-red-300",
        };

        return (
            <div
                key={index}
                ref={isLastChange ? lastChangeRef : undefined}
                className={cn(
                    "relative min-h-[1.5em] py-0.5 px-16 sm:px-[max(64px,calc(50%-350px))]",
                    groupStyles[group.type],
                )}
            >
                {group.type !== "unchanged" && (
                    <div className="absolute left-2 top-1/2 -translate-y-1/2 w-6 text-center font-bold text-sm">
                        {group.type === "addition" && (
                            <span className="text-green-600 dark:text-green-400">+</span>
                        )}
                        {group.type === "deletion" && (
                            <span className="text-red-600 dark:text-red-400">−</span>
                        )}
                    </div>
                )}

                <div className={cn("prose dark:prose-invert prose-sm max-w-none", textStyles[group.type])}>
                    <RenderedNodes nodes={nodes} isDeletion={group.type === "deletion"} />
                </div>
            </div>
        );
    };

    return (
        <div className="absolute inset-0 z-50 overflow-auto pointer-events-auto bg-background">
            <div className="pt-4 pb-72">{groups.map((g, i) => renderGroup(g, i))}</div>
        </div>
    );
}

// ==================== Node rendering ====================

function RenderedNodes({ nodes, isDeletion }: { nodes: PlateNode[]; isDeletion: boolean }) {
    return (
        <>
            {nodes.map((node, i) => (
                <RenderedNode key={i} node={node} isDeletion={isDeletion} />
            ))}
        </>
    );
}

function RenderedNode({ node, isDeletion }: { node: PlateNode; isDeletion: boolean }) {
    if ("text" in node) {
        let content: React.ReactNode = node.text;
        if (node.bold) content = <strong>{content}</strong>;
        if (node.italic) content = <em>{content}</em>;
        if (node.underline) content = <u>{content}</u>;
        if (node.strikethrough || isDeletion) content = <del>{content}</del>;
        if (node.code) content = <code className="px-1 py-0.5 bg-muted rounded text-sm">{content}</code>;
        return <>{content}</>;
    }

    const elementNode = node as PlateElementNode;
    const children = elementNode.children?.map((child: PlateNode, i: number) => (
        <RenderedNode key={i} node={child} isDeletion={isDeletion} />
    ));

    switch (node.type) {
        case "p":
            return <p className="my-1">{children}</p>;
        case "h1":
            return <h1 className="text-3xl font-bold mt-6 mb-2">{children}</h1>;
        case "h2":
            return <h2 className="text-2xl font-bold mt-5 mb-2">{children}</h2>;
        case "h3":
            return <h3 className="text-xl font-bold mt-4 mb-1">{children}</h3>;
        case "h4":
            return <h4 className="text-lg font-bold mt-3 mb-1">{children}</h4>;
        case "h5":
            return <h5 className="text-base font-bold mt-2 mb-1">{children}</h5>;
        case "h6":
            return <h6 className="text-sm font-bold mt-2 mb-1">{children}</h6>;
        case "blockquote":
            return <blockquote className="border-l-4 border-muted-foreground/30 pl-4 italic my-2">{children}</blockquote>;
        case "code_block":
            return (
                <pre className="bg-muted p-3 rounded-md overflow-x-auto my-2">
                    <code className="text-sm">{children}</code>
                </pre>
            );
        case "ul":
            return <ul className="list-disc list-inside my-1">{children}</ul>;
        case "ol":
            return <ol className="list-decimal list-inside my-1">{children}</ol>;
        case "li":
        case "lic":
            return <li>{children}</li>;
        case "a":
            return <a href={elementNode.url} className="text-blue-600 dark:text-blue-400 underline">{children}</a>;
        case "img":
            // eslint-disable-next-line @next/next/no-img-element
            return <img src={elementNode.url} alt={elementNode.alt || ""} className="max-w-full h-auto rounded my-2" />;
        case "hr":
            return <hr className="my-4 border-muted-foreground/30" />;
        case "table":
            return <table className="border-collapse border border-muted my-2 w-full">{children}</table>;
        case "tr":
            return <tr className="border border-muted">{children}</tr>;
        case "th":
            return <th className="border border-muted px-3 py-1 bg-muted font-bold">{children}</th>;
        case "td":
            return <td className="border border-muted px-3 py-1">{children}</td>;
        case "equation":
        case "inline_equation":
            return <span className="font-mono bg-muted/50 px-1 rounded">{elementNode.texExpression || children}</span>;
        case "callout":
            return (
                <div
                    className={cn(
                        "my-2 p-3 rounded-md border-l-4",
                        elementNode.variant === "warning"
                            ? "bg-yellow-50 dark:bg-yellow-900/20 border-yellow-500"
                            : elementNode.variant === "danger"
                                ? "bg-red-50 dark:bg-red-900/20 border-red-500"
                                : elementNode.variant === "success"
                                    ? "bg-green-50 dark:bg-green-900/20 border-green-500"
                                    : "bg-blue-50 dark:bg-blue-900/20 border-blue-500",
                    )}
                >
                    {children}
                </div>
            );
        default:
            return <span>{children}</span>;
    }
}
