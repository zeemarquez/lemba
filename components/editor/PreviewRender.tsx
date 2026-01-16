"use client";

import React from 'react';
import ReactMarkdown from 'react-markdown';
import rehypeHighlight from 'rehype-highlight';
import remarkMath from 'remark-math';
import remarkGfm from 'remark-gfm';
import rehypeKatex from 'rehype-katex';
import 'highlight.js/styles/github.css';
import 'katex/dist/katex.min.css';

interface PreviewRenderProps {
    content: string;
    className?: string;
}

export function PreviewRender({ content, className }: PreviewRenderProps) {
    return (
        <article className={`prose prose-zinc dark:prose-invert max-w-none w-full ${className}`}>
            <ReactMarkdown 
                remarkPlugins={[remarkMath, remarkGfm]}
                rehypePlugins={[rehypeHighlight, rehypeKatex]}
            >
                {content}
            </ReactMarkdown>
        </article>
    );
}
