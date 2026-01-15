"use client";

import React from 'react';
import CodeMirror from '@uiw/react-codemirror';
import { markdown, markdownLanguage } from '@codemirror/lang-markdown';
import { languages } from '@codemirror/language-data';
import { useTheme } from 'next-themes';
import { githubLight, githubDark } from '@uiw/codemirror-theme-github';

interface SourceEditorProps {
    content: string;
    onChange: (value: string) => void;
}

export function SourceEditor({ content, onChange }: SourceEditorProps) {
    const { theme } = useTheme();

    return (
        <div className="h-full w-full overflow-hidden text-base">
            <CodeMirror
                value={content}
                height="100%"
                extensions={[markdown({ base: markdownLanguage, codeLanguages: languages })]}
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
