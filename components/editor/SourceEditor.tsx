"use client";

import React, { useMemo, useRef, useEffect, useCallback } from 'react';
import CodeMirror, { ReactCodeMirrorRef } from '@uiw/react-codemirror';
import { markdown, markdownLanguage } from '@codemirror/lang-markdown';
import { languages } from '@codemirror/language-data';
import { syntaxHighlighting } from '@codemirror/language';
import { tags, tagHighlighter } from '@lezer/highlight';
import { EditorView, Decoration, ViewPlugin, ViewUpdate } from '@codemirror/view';
import { useTheme } from 'next-themes';
import { githubLight, githubDark } from '@uiw/codemirror-theme-github';
import { useStore } from '@/lib/store';
import { debounce } from 'lodash';

interface SourceEditorProps {
    content: string;
    onChange: (value: string) => void;
}

export function SourceEditor({ content, onChange }: SourceEditorProps) {
    const { theme } = useTheme();
    const { sourceEditorFontFamily, sourceEditorFontSize, setActiveHeadingId } = useStore();
    const editorRef = useRef<ReactCodeMirrorRef>(null);

    // Listen for navigation events from the outline
    const handleNavigateToLine = useCallback((event: CustomEvent<{ line: number }>) => {
        const { line } = event.detail;
        const view = editorRef.current?.view;
        if (!view) return;

        // Get the position of the start of the target line
        const lineInfo = view.state.doc.line(Math.min(line, view.state.doc.lines));
        
        // Set selection first
        view.dispatch({
            selection: { anchor: lineInfo.from },
        });
        
        // Scroll to the line at the top of the viewport
        const coords = view.coordsAtPos(lineInfo.from);
        if (coords) {
            const scrollContainer = view.scrollDOM;
            const scrollTop = scrollContainer.scrollTop;
            const lineTop = coords.top;
            const containerTop = scrollContainer.getBoundingClientRect().top;
            const relativeTop = lineTop - containerTop;
            
            // Scroll so the line appears at the top (with a small offset for padding)
            scrollContainer.scrollTo({
                top: scrollTop + relativeTop - 20, // 20px offset for padding
                behavior: 'smooth'
            });
        } else {
            // Fallback to default scrollIntoView if coords not available
            view.dispatch({
                scrollIntoView: true,
            });
        }
        
        // Focus the editor
        view.focus();
    }, []);

    useEffect(() => {
        window.addEventListener('navigate-to-line', handleNavigateToLine as EventListener);
        return () => {
            window.removeEventListener('navigate-to-line', handleNavigateToLine as EventListener);
        };
    }, [handleNavigateToLine]);

    useEffect(() => {
        const handleInsertText = (event: CustomEvent<{ text: string }>) => {
            const view = editorRef.current?.view;
            if (!view) return;
            const { text } = event.detail || {};
            if (!text) return;
            const selection = view.state.selection.main;
            view.dispatch({
                changes: { from: selection.from, to: selection.to, insert: text },
                selection: { anchor: selection.from + text.length },
            });
            view.focus();
        };

        window.addEventListener('insert-source-text', handleInsertText as EventListener);
        return () => {
            window.removeEventListener('insert-source-text', handleInsertText as EventListener);
        };
    }, []);

    // Function to find the active heading based on cursor line
    const findActiveHeading = useCallback((lineNumber: number) => {
        if (!content) {
            setActiveHeadingId(null);
            return;
        }

        const lines = content.split('\n');
        let inCodeBlock = false;
        let lastHeading: { id: string; line: number } | null = null;

        for (let i = 0; i < lines.length && i < lineNumber; i++) {
            const line = lines[i];
            
            // Track code blocks to avoid parsing headings inside them
            if (line.trim().startsWith('```')) {
                inCodeBlock = !inCodeBlock;
                continue;
            }
            
            if (inCodeBlock) continue;
            
            // Match ATX-style headings: # Heading, ## Heading, etc.
            const match = line.match(/^(#{1,6})\s+(.+)$/);
            if (match) {
                lastHeading = {
                    id: `heading-${i}`,
                    line: i + 1,
                };
            }
        }

        setActiveHeadingId(lastHeading?.id || null);
    }, [content, setActiveHeadingId]);

    // Debounced function to update active heading
    const debouncedFindActiveHeading = useMemo(
        () => debounce((lineNumber: number) => {
            findActiveHeading(lineNumber);
        }, 100),
        [findActiveHeading]
    );

    // Function to extract text around cursor for PDF sync
    const extractTextAroundCursor = useCallback((pos: number, doc: any) => {
        if (!doc) return '';
        
        // Get text around cursor (about 50 characters before and after)
        const start = Math.max(0, pos - 50);
        const end = Math.min(doc.length, pos + 50);
        const text = doc.sliceString(start, end);
        
        // Extract a meaningful snippet (prefer word boundaries)
        const words = text.split(/\s+/);
        if (words.length < 3) return text.trim();
        
        // Get middle words (skip first and last which might be partial)
        const middleStart = Math.floor(words.length / 2) - 2;
        const middleEnd = Math.floor(words.length / 2) + 3;
        const snippet = words.slice(Math.max(0, middleStart), Math.min(words.length, middleEnd)).join(' ');
        
        return snippet.trim();
    }, []);

    // Debounced function to sync PDF preview with cursor position
    const debouncedSyncPdfPreview = useMemo(
        () => debounce((text: string) => {
            if (!text) return;
            // Dispatch event to sync PDF preview
            const event = new CustomEvent('sync-pdf-to-cursor', {
                detail: { searchText: text }
            });
            window.dispatchEvent(event);
        }, 300), // Debounce to avoid too frequent updates
        []
    );

    // Extension to track cursor position changes
    const cursorTrackingExtension = useMemo(() => {
        return EditorView.updateListener.of((update) => {
            if (update.selectionSet || update.docChanged) {
                const selection = update.state.selection.main;
                const lineNumber = update.state.doc.lineAt(selection.head).number;
                debouncedFindActiveHeading(lineNumber);
                
                // Extract text around cursor for PDF sync
                if (update.selectionSet) {
                    const text = extractTextAroundCursor(selection.head, update.state.doc);
                    if (text) {
                        debouncedSyncPdfPreview(text);
                    }
                }
            }
        });
    }, [debouncedFindActiveHeading, extractTextAroundCursor, debouncedSyncPdfPreview]);

    // Track cursor position on mount and when view becomes available
    useEffect(() => {
        const view = editorRef.current?.view;
        if (!view) return;

        const updateActiveHeading = () => {
            const selection = view.state.selection.main;
            const lineNumber = view.state.doc.lineAt(selection.head).number;
            debouncedFindActiveHeading(lineNumber);
        };

        // Initial update
        updateActiveHeading();

        // Cleanup
        return () => {
            debouncedFindActiveHeading.cancel();
            debouncedSyncPdfPreview.cancel();
        };
    }, [debouncedFindActiveHeading, debouncedSyncPdfPreview]);

    const fontExtension = useMemo(() => {
        return EditorView.theme({
            '&': {
                fontFamily: sourceEditorFontFamily,
                fontSize: `${sourceEditorFontSize}px`,
            },
            '.cm-content': {
                fontFamily: sourceEditorFontFamily,
                fontSize: `${sourceEditorFontSize}px`,
            },
            '.cm-line': {
                fontFamily: sourceEditorFontFamily,
                fontSize: `${sourceEditorFontSize}px`,
            },
            '.cm-placeholder-token': {
                fontWeight: '700',
                color: 'rgb(168, 85, 247)',
            },
        });
    }, [sourceEditorFontFamily, sourceEditorFontSize]);

    const placeholderDecoration = useMemo(() => {
        const placeholderRegex = /\{\{[^}]+\}\}/g;
        const deco = Decoration.mark({ class: 'cm-placeholder-token' });

        return ViewPlugin.fromClass(class {
            decorations: ReturnType<typeof Decoration.set>;

            constructor(view: EditorView) {
                this.decorations = this.buildDecorations(view);
            }

            update(update: ViewUpdate) {
                if (update.docChanged || update.viewportChanged) {
                    this.decorations = this.buildDecorations(update.view);
                }
            }

            buildDecorations(view: EditorView) {
                const widgets = [];
                for (const { from, to } of view.visibleRanges) {
                    const text = view.state.doc.sliceString(from, to);
                    placeholderRegex.lastIndex = 0;
                    let match: RegExpExecArray | null;
                    while ((match = placeholderRegex.exec(text)) !== null) {
                        const start = from + match.index;
                        const end = start + match[0].length;
                        widgets.push(deco.range(start, end));
                    }
                }
                return Decoration.set(widgets, true);
            }
        }, {
            decorations: (v) => v.decorations
        });
    }, []);

    const headingColorExtension = useMemo(() => {
        if (theme !== 'dark') {
            return [];
        }
        const headingClass = syntaxHighlighting(
            tagHighlighter([{ tag: tags.heading, class: 'cm-heading-white' }])
        );
        return [headingClass];
    }, [theme]);

    const extensions = useMemo(() => [
        markdown({ base: markdownLanguage, codeLanguages: languages }),
        fontExtension,
        cursorTrackingExtension,
        placeholderDecoration,
        ...headingColorExtension,
    ], [fontExtension, cursorTrackingExtension, placeholderDecoration, headingColorExtension]);

    return (
        <div className="h-full w-full overflow-hidden text-base">
            <CodeMirror
                ref={editorRef}
                value={content}
                height="100%"
                extensions={extensions}
                onChange={onChange}
                theme={theme === 'dark' ? githubDark : githubLight}
                className="h-full w-full"
                basicSetup={{
                    lineNumbers: false,
                    highlightActiveLineGutter: false,
                    highlightSpecialChars: false,
                    history: true,
                    foldGutter: false,
                    drawSelection: true,
                    dropCursor: true,
                    allowMultipleSelections: true,
                    indentOnInput: true,
                    syntaxHighlighting: true,
                    bracketMatching: true,
                    closeBrackets: true,
                    autocompletion: false,
                    rectangularSelection: true,
                    crosshairCursor: false,
                    highlightActiveLine: false,
                    highlightSelectionMatches: false,
                    closeBracketsKeymap: true,
                    defaultKeymap: true,
                    searchKeymap: true,
                    historyKeymap: true,
                    foldKeymap: true,
                    completionKeymap: true,
                    lintKeymap: true,
                }}
            />
        </div>
    );
}
