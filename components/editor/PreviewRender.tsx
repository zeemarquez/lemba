"use client";

import React from 'react';
import ReactMarkdown from 'react-markdown';
import rehypeHighlight from 'rehype-highlight';
import 'highlight.js/styles/github.css'; // Or github-dark.css depending on theme (need to handle dynamic import or just load standard)

interface PreviewRenderProps {
    content: string;
    className?: string;
}

export function PreviewRender({ content, className }: PreviewRenderProps) {
    return (
        <article className={`prose prose-zinc dark:prose-invert max-w-none w-full ${className}`}>
            <ReactMarkdown rehypePlugins={[rehypeHighlight]}>
                {content}
            </ReactMarkdown>
        </article>
    );
}
