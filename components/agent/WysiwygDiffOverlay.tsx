"use client";

import React, { useMemo, useRef, useEffect } from "react";
import { DocumentDiff } from "@/lib/agent";
import { cn } from "@/lib/utils";
import { createPlateEditor } from "platejs/react";
import { EditorKit } from "@/components/plate-editor/editor-kit";
import { preprocessMathDelimiters, preprocessHtmlTables } from "@/components/plate-editor/plugins/markdown-kit";

// TypeScript interfaces for Plate node types
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

interface WysiwygDiffOverlayProps {
    diff: DocumentDiff;
}

/**
 * WYSIWYG Diff Overlay
 * Renders the diff with the proposed content as rendered markdown,
 * highlighting additions in green and deletions in red with strikethrough.
 */
export function WysiwygDiffOverlay({ diff }: WysiwygDiffOverlayProps) {
    const lastChangeRef = useRef<HTMLDivElement | null>(null);

    // Create a temp editor for deserializing markdown
    const tempEditor = useMemo(() => {
        return createPlateEditor({
            plugins: EditorKit,
        });
    }, []);

    // Build a merged view: show both deleted (struck through) and added (green) content
    // We use the hunks to identify what changed
    const { formattedContent, lastChangedIndex } = useMemo(() => {
        const hunks = diff.hunks;
        const oldLines = diff.originalContent.split('\n');

        // Build a line-by-line view with change markers
        interface LineInfo {
            content: string;
            type: 'unchanged' | 'deletion' | 'addition';
            lineNumber?: number;
        }

        const lines: LineInfo[] = [];
        let oldLineNum = 1;
        let newLineNum = 1;
        let lastChanged = -1;

        for (let hunkIdx = 0; hunkIdx < hunks.length; hunkIdx++) {
            const hunk = hunks[hunkIdx];
            const hunkStartOld = hunk.startLine;

            // Add unchanged lines before this hunk
            while (oldLineNum < hunkStartOld && oldLineNum <= oldLines.length) {
                lines.push({
                    content: oldLines[oldLineNum - 1],
                    type: 'unchanged',
                    lineNumber: newLineNum,
                });
                oldLineNum++;
                newLineNum++;
            }

            // Add deleted lines
            for (const line of hunk.oldLines) {
                lastChanged = lines.length;
                lines.push({
                    content: line,
                    type: 'deletion',
                });
                oldLineNum++;
            }

            // Add added lines
            for (const line of hunk.newLines) {
                lastChanged = lines.length;
                lines.push({
                    content: line,
                    type: 'addition',
                    lineNumber: newLineNum,
                });
                newLineNum++;
            }
        }

        // Add remaining unchanged lines after the last hunk
        while (oldLineNum <= oldLines.length) {
            lines.push({
                content: oldLines[oldLineNum - 1],
                type: 'unchanged',
                lineNumber: newLineNum,
            });
            oldLineNum++;
            newLineNum++;
        }

        return { formattedContent: lines, lastChangedIndex: lastChanged };
    }, [diff]);

    // Scroll to the last change when the diff changes
    useEffect(() => {
        if (lastChangedIndex < 0) return;
        const el = lastChangeRef.current;
        if (el) {
            el.scrollIntoView({ behavior: "smooth", block: "center" });
        }
    }, [lastChangedIndex, diff.id]);

    // Deserialize each line's content and render it
    const renderLine = (lineInfo: { content: string; type: 'unchanged' | 'deletion' | 'addition'; lineNumber?: number }, index: number) => {
        const isLastChange = index === lastChangedIndex;

        // Deserialize the markdown line to Plate nodes
        let nodes: PlateNode[] = [];
        try {
            const preprocessed = preprocessHtmlTables(preprocessMathDelimiters(lineInfo.content));
            nodes = tempEditor.api.markdown.deserialize(preprocessed) as PlateNode[];
        } catch {
            // Fallback to plain text if deserialization fails
            nodes = [{ type: 'p', children: [{ text: lineInfo.content }] }];
        }

        // Render the nodes with appropriate styling
        const lineStyles = {
            unchanged: "",
            addition: "bg-green-100/50 dark:bg-green-500/10 border-l-2 border-green-500",
            deletion: "bg-red-100/50 dark:bg-red-500/10 border-l-2 border-red-500 line-through opacity-60",
        };

        const textStyles = {
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
                    lineStyles[lineInfo.type]
                )}
            >
                {/* Change indicator */}
                {lineInfo.type !== 'unchanged' && (
                    <div className="absolute left-2 top-1/2 -translate-y-1/2 w-6 text-center font-bold text-sm">
                        {lineInfo.type === 'addition' && (
                            <span className="text-green-600 dark:text-green-400">+</span>
                        )}
                        {lineInfo.type === 'deletion' && (
                            <span className="text-red-600 dark:text-red-400">−</span>
                        )}
                    </div>
                )}

                {/* Rendered content */}
                <div className={cn("prose dark:prose-invert prose-sm max-w-none", textStyles[lineInfo.type])}>
                    <RenderedNodes nodes={nodes} isDeletion={lineInfo.type === 'deletion'} />
                </div>
            </div>
        );
    };

    return (
        <div className="absolute inset-0 z-50 overflow-auto pointer-events-auto bg-background">
            <div className="pt-4 pb-72">
                {formattedContent.map((line, index) => renderLine(line, index))}
            </div>
        </div>
    );
}

/**
 * Renders Plate nodes as HTML with basic formatting
 */
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
    // Handle text nodes
    if ('text' in node) {
        let content: React.ReactNode = node.text;

        // Apply marks
        if (node.bold) content = <strong>{content}</strong>;
        if (node.italic) content = <em>{content}</em>;
        if (node.underline) content = <u>{content}</u>;
        if (node.strikethrough || isDeletion) content = <del>{content}</del>;
        if (node.code) content = <code className="px-1 py-0.5 bg-muted rounded text-sm">{content}</code>;

        return <>{content}</>;
    }

    // Handle element nodes
    const elementNode = node as PlateElementNode;
    const children = elementNode.children?.map((child: PlateNode, i: number) => (
        <RenderedNode key={i} node={child} isDeletion={isDeletion} />
    ));

    switch (node.type) {
        case 'p':
            return <p className="my-1">{children}</p>;
        case 'h1':
            return <h1 className="text-3xl font-bold mt-6 mb-2">{children}</h1>;
        case 'h2':
            return <h2 className="text-2xl font-bold mt-5 mb-2">{children}</h2>;
        case 'h3':
            return <h3 className="text-xl font-bold mt-4 mb-1">{children}</h3>;
        case 'h4':
            return <h4 className="text-lg font-bold mt-3 mb-1">{children}</h4>;
        case 'h5':
            return <h5 className="text-base font-bold mt-2 mb-1">{children}</h5>;
        case 'h6':
            return <h6 className="text-sm font-bold mt-2 mb-1">{children}</h6>;
        case 'blockquote':
            return <blockquote className="border-l-4 border-muted-foreground/30 pl-4 italic my-2">{children}</blockquote>;
        case 'code_block':
            return (
                <pre className="bg-muted p-3 rounded-md overflow-x-auto my-2">
                    <code className="text-sm">{children}</code>
                </pre>
            );
        case 'ul':
            return <ul className="list-disc list-inside my-1">{children}</ul>;
        case 'ol':
            return <ol className="list-decimal list-inside my-1">{children}</ol>;
        case 'li':
        case 'lic':
            return <li>{children}</li>;
        case 'a':
            return <a href={elementNode.url} className="text-blue-600 dark:text-blue-400 underline">{children}</a>;
        case 'img':
            // eslint-disable-next-line @next/next/no-img-element
            return <img src={elementNode.url} alt={elementNode.alt || ''} className="max-w-full h-auto rounded my-2" />;
        case 'hr':
            return <hr className="my-4 border-muted-foreground/30" />;
        case 'table':
            return <table className="border-collapse border border-muted my-2 w-full">{children}</table>;
        case 'tr':
            return <tr className="border border-muted">{children}</tr>;
        case 'th':
            return <th className="border border-muted px-3 py-1 bg-muted font-bold">{children}</th>;
        case 'td':
            return <td className="border border-muted px-3 py-1">{children}</td>;
        case 'equation':
        case 'inline_equation':
            // Just render the equation content as-is for now
            return <span className="font-mono bg-muted/50 px-1 rounded">{elementNode.texExpression || children}</span>;
        case 'callout':
            return (
                <div className={cn(
                    "my-2 p-3 rounded-md border-l-4",
                    elementNode.variant === 'warning' ? "bg-yellow-50 dark:bg-yellow-900/20 border-yellow-500" :
                        elementNode.variant === 'danger' ? "bg-red-50 dark:bg-red-900/20 border-red-500" :
                            elementNode.variant === 'success' ? "bg-green-50 dark:bg-green-900/20 border-green-500" :
                                "bg-blue-50 dark:bg-blue-900/20 border-blue-500"
                )}>
                    {children}
                </div>
            );
        default:
            // Fallback: render children in a span
            return <span>{children}</span>;
    }
}
