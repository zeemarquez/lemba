"use client";

import React, { useMemo, useRef, useEffect, useCallback } from 'react';
import CodeMirror, { ReactCodeMirrorRef } from '@uiw/react-codemirror';
import { markdown, markdownLanguage } from '@codemirror/lang-markdown';
import { languages } from '@codemirror/language-data';
import { EditorView } from '@codemirror/view';
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
        
        // Scroll to the line and place cursor there
        view.dispatch({
            selection: { anchor: lineInfo.from },
            scrollIntoView: true,
        });
        
        // Focus the editor
        view.focus();
    }, []);

    useEffect(() => {
        window.addEventListener('navigate-to-line', handleNavigateToLine as EventListener);
        return () => {
            window.removeEventListener('navigate-to-line', handleNavigateToLine as EventListener);
        };
    }, [handleNavigateToLine]);

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

    // Extension to track cursor position changes
    const cursorTrackingExtension = useMemo(() => {
        return EditorView.updateListener.of((update) => {
            if (update.selectionSet || update.docChanged) {
                const selection = update.state.selection.main;
                const lineNumber = update.state.doc.lineAt(selection.head).number;
                debouncedFindActiveHeading(lineNumber);
            }
        });
    }, [debouncedFindActiveHeading]);

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
        };
    }, [debouncedFindActiveHeading]);

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
        });
    }, [sourceEditorFontFamily, sourceEditorFontSize]);

    const extensions = useMemo(() => [
        markdown({ base: markdownLanguage, codeLanguages: languages }),
        fontExtension,
        cursorTrackingExtension,
    ], [fontExtension, cursorTrackingExtension]);

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
