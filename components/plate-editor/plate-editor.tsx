'use client';

import { useMemo, useEffect, useRef, useCallback } from 'react';
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

  // Use a ref to track if we're currently updating from Plate to avoid infinite loops
  const isUpdatingFromPlate = useRef(false);

  const initialValue = useMemo(() => {
    const tempEditor = createPlateEditor({ plugins: EditorKit });
    // Preprocess to convert single-line $$..$$ to multi-line for correct parsing
    const preprocessed = preprocessMathDelimiters(content);
    return tempEditor.api.markdown.deserialize(preprocessed);
  }, []); // Only once

  const editor = usePlateEditor({
    plugins: EditorKit,
    value: initialValue,
  });

  // Sync content from Source view back to Plate if content changed externally or in source mode
  useEffect(() => {
    // Optimization: Skip deserialization when in source mode to prevent lag.
    if (editorViewMode === 'source') return;

    if (!isUpdatingFromPlate.current) {
      // Preprocess to convert single-line $$..$$ to multi-line for correct parsing
      const preprocessed = preprocessMathDelimiters(content);
      const newValue = editor.api.markdown.deserialize(preprocessed);
      editor.tf.setValue(newValue);
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
        // Serialize and postprocess to normalize block equation format
        const rawMd = editor.api.markdown.serialize({ value });
        const md = postprocessMathDelimiters(rawMd);
        if (md !== content) {
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
              <Editor variant="demo" />
            </EditorContainer>
          )}
        </div>
      </div>
    </Plate>
  );
}
