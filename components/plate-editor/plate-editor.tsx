'use client';

import React, { useMemo, useEffect, useRef, useCallback, useState } from 'react';
import { createPlateEditor, Plate, usePlateEditor } from 'platejs/react';
import { useStore } from '@/lib/store';
import { useMounted } from '@/hooks/use-mounted';

import { EditorKit } from '@/components/plate-editor/editor-kit';
import { Editor, EditorContainer } from '@/components/plate-ui/editor';
import { FixedToolbar } from '@/components/plate-ui/fixed-toolbar';
import { FixedToolbarButtons } from '@/components/plate-ui/fixed-toolbar-buttons';
import { SourceEditor } from '@/components/editor/SourceEditor';
import { preprocessMathDelimiters, postprocessMathDelimiters } from '@/components/plate-editor/plugins/markdown-kit';
import { Path, Node } from 'slate';

interface PlateEditorProps {
  content: string;
  onChange: (value: string) => void;
}

export function PlateEditor({ content, onChange }: PlateEditorProps) {
  const { editorViewMode } = useStore();
  const mounted = useMounted();
  const [isLoading, setIsLoading] = React.useState(true);

  // Use a ref to track if we're currently updating from Plate to avoid infinite loops
  const isUpdatingFromPlate = useRef(false);

  // Cache the last content we deserialized to avoid re-doing work
  const lastDeserializedContent = useRef<string | null>(null);

  const initialValue = useMemo(() => {
    // Optimization: Initialize empty to allow immediate mount.
    // The useEffect below will handle the actual content deserialization asynchronously.
    const tempEditor = createPlateEditor({ plugins: EditorKit });
    lastDeserializedContent.current = null;
    return tempEditor.api.markdown.deserialize('');
  }, []); // Only once

  const editor = usePlateEditor({
    plugins: EditorKit,
    value: initialValue,
  });

  // Sync content from Source view back to Plate if content changed externally or in source mode
  useEffect(() => {
    // Optimization: Skip deserialization when in source mode to prevent lag.
    if (editorViewMode === 'source') {
      setIsLoading(false);
      return;
    }

    if (!isUpdatingFromPlate.current) {
      // Optimization: Check if content actually changed significantly or if we just cached it
      if (lastDeserializedContent.current === content) {
        setIsLoading(false);
        return;
      }

      // Optimization: For small/medium documents, process synchronously to avoid "Loading..." flicker
      // 50,000 characters is roughly 15-20 pages of text.
      if (content.length < 50000) {
        try {
          const preprocessed = preprocessMathDelimiters(content);
          const newValue = editor.api.markdown.deserialize(preprocessed);
          editor.tf.setValue(newValue);
          lastDeserializedContent.current = content;
        } catch (e) {
          console.error('Error deserializing markdown:', e);
        } finally {
          setIsLoading(false);
        }
        return;
      }

      setIsLoading(true);

      // Wrap in setTimeout to unblock main thread/render cycle, allowing loading spinner to show
      // and preventing UI freeze on large documents
      const timer = setTimeout(() => {
        try {
          // Preprocess to convert single-line $$..$$ to multi-line for correct parsing
          const preprocessed = preprocessMathDelimiters(content);
          const newValue = editor.api.markdown.deserialize(preprocessed);

          // Use withoutNormalizing for performance if possible
          editor.tf.setValue(newValue);

          lastDeserializedContent.current = content;
        } catch (error) {
          console.error('Error deserializing large markdown:', error);
        } finally {
          setIsLoading(false);
        }
      }, 10);

      return () => clearTimeout(timer);
    }
  }, [content, editor, editorViewMode]);

  // Listen for navigation events from the outline (for WYSIWYG mode)
  const handleNavigateToLine = useCallback((event: CustomEvent<{ line: number }>) => {
    // Only handle in non-source mode
    if (editorViewMode === 'source') return;

    const { line } = event.detail;
    const lines = content.split('\n');

    // Find the heading text at the target line
    const targetLine = lines[line - 1];
    if (!targetLine) return;

    const headingMatch = targetLine.match(/^#{1,6}\s+(.+)$/);
    if (!headingMatch) return;

    const headingText = headingMatch[1].trim();

    // Find the heading node in the editor
    // Use editor.children directly and iterate with proper typing
    const findHeadingNode = (nodes: typeof editor.children, basePath: Path = []): void => {
      for (let i = 0; i < nodes.length; i++) {
        const node = nodes[i];
        const path = [...basePath, i];

        if ('type' in node && typeof node.type === 'string' && node.type.startsWith('h')) {
          // Get the text content of this heading
          const textContent = Node.string(node);
          if (textContent.trim() === headingText) {
            // Select the heading and scroll to it
            try {
              editor.tf.select(editor.api.start(path));
              // Scroll the heading into view
              const domNode = editor.api.toDOMNode(node);
              if (domNode) {
                domNode.scrollIntoView({ behavior: 'smooth', block: 'center' });
              }
            } catch (e) {
              // Ignore selection errors
            }
            return;
          }
        }

        // Recursively check children if they exist
        if ('children' in node && Array.isArray(node.children)) {
          findHeadingNode(node.children as typeof editor.children, path);
        }
      }
    };

    findHeadingNode(editor.children);
  }, [editorViewMode, content, editor]);

  useEffect(() => {
    window.addEventListener('navigate-to-line', handleNavigateToLine as EventListener);
    return () => {
      window.removeEventListener('navigate-to-line', handleNavigateToLine as EventListener);
    };
  }, [handleNavigateToLine]);

  if (!mounted) {
    return (
      <div className="h-full w-full bg-background" />
    );
  }

  return (
    <Plate
      editor={editor}
      onChange={({ value }) => {
        isUpdatingFromPlate.current = true;

        // Debounce the serialization/update to avoid checking every keystroke synchronously if possible
        // But for Controlled inputs we usually need it. 
        // We'll trust Plate's internal optimization but help it by not re-rendering unnecessarily.

        // Serialize and postprocess to normalize block equation format
        const rawMd = editor.api.markdown.serialize({ value });
        const md = postprocessMathDelimiters(rawMd);

        if (md !== content) {
          lastDeserializedContent.current = md; // Update cache so we don't re-deserialize our own change
          onChange(md);
        }

        // Defer resetting the flag to allow the useEffect to see it as true
        // This prevents the effect from resetting the editor and losing focus
        setTimeout(() => {
          isUpdatingFromPlate.current = false;
        }, 0);
      }}
    >
      <div className="h-full flex flex-col relative w-full overflow-hidden">
        <FixedToolbar>
          <FixedToolbarButtons />
        </FixedToolbar>

        <div className="flex-1 overflow-hidden relative w-full h-full">
          {editorViewMode === 'source' ? (
            <SourceEditor
              content={content}
              onChange={(val) => {
                isUpdatingFromPlate.current = false; // Source edit
                onChange(val);
              }}
            />
          ) : (
            <EditorContainer>
              {isLoading ? (
                <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-background/80 backdrop-blur-sm animate-in fade-in duration-200">
                  <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-r-transparent" />
                  <p className="mt-4 text-sm text-muted-foreground animate-pulse">Processing content...</p>
                </div>
              ) : null}
              <Editor variant="demo" />
            </EditorContainer>
          )}
        </div>
      </div>
    </Plate>
  );
}
