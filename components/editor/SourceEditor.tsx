"use client";

import React, { useMemo, useRef, useEffect, useCallback } from 'react';
import CodeMirror, { ReactCodeMirrorRef } from '@uiw/react-codemirror';
import { markdown, markdownLanguage } from '@codemirror/lang-markdown';
import { languages } from '@codemirror/language-data';
import { EditorView } from '@codemirror/view';
import { useTheme } from 'next-themes';
import { githubLight, githubDark } from '@uiw/codemirror-theme-github';
import { useStore } from '@/lib/store';

interface SourceEditorProps {
    content: string;
    onChange: (value: string) => void;
}

export function SourceEditor({ content, onChange }: SourceEditorProps) {
    const { theme } = useTheme();
    const { sourceEditorFontFamily, sourceEditorFontSize } = useStore();
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
    ], [fontExtension]);

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
