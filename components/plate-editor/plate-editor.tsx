'use client';

import { useMemo, useEffect, useRef, useCallback } from 'react';
import { Plate, usePlateEditor } from 'platejs/react';
import { useStore } from '@/lib/store';
import { useMounted } from '@/hooks/use-mounted';
import { debounce } from 'lodash';

import { EditorKit } from '@/components/plate-editor/editor-kit';
import { Editor, EditorContainer } from '@/components/plate-ui/editor';
import { FixedToolbar } from '@/components/plate-ui/fixed-toolbar';
import { FixedToolbarButtons } from '@/components/plate-ui/fixed-toolbar-buttons';
import { SourceEditor } from '@/components/editor/SourceEditor';
import { postprocessMathDelimiters } from '@/components/plate-editor/plugins/markdown-kit';
import { Path, Node } from 'slate';
import { 
  processMarkdownDiff, 
  updateCacheFromMarkdown,
  isCacheValid 
} from '@/lib/markdown-processor';

interface PlateEditorProps {
  content: string;
  onChange: (value: string) => void;
}

export function PlateEditor({ content, onChange }: PlateEditorProps) {
  const { editorViewMode } = useStore();
  const mounted = useMounted();

  // Use a ref to track if we're currently updating from Plate to avoid infinite loops
  const isUpdatingFromPlate = useRef(false);
  // Track previous editor view mode to detect actual mode switches
  const prevEditorViewMode = useRef(editorViewMode);
  // Track last deserialized content to avoid redundant deserialization
  const lastDeserializedContent = useRef<string | null>(null);
  // Track the last nodes array reference we set - to avoid redundant setValue calls
  const lastSetNodesRef = useRef<any[] | null>(null);
  // Refs to store latest values for debounced function
  const editorRef = useRef<any>(null);
  const contentRef = useRef(content);
  const onChangeRef = useRef(onChange);

  // Update refs when values change
  useEffect(() => {
    contentRef.current = content;
    onChangeRef.current = onChange;
  }, [content, onChange]);

  // Compute initialValue using the optimized processor with caching
  // Only compute once on mount - subsequent updates go through useEffect
  const initialValue = useMemo(() => {
    // Use the cached processor for initial value - this also warms up the cache
    const { nodes } = processMarkdownDiff(content);
    lastDeserializedContent.current = content;
    lastSetNodesRef.current = nodes; // Track initial nodes
    return nodes;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Empty deps - only compute once on mount

  const editor = usePlateEditor({
    plugins: EditorKit,
    value: initialValue,
  });

  // Update editor ref
  editorRef.current = editor;

  // Create debounced serialization function using refs to always use latest values
  const debouncedSerialize = useMemo(
    () =>
      debounce((value: any) => {
        // Use refs to get latest values at execution time
        const currentEditor = editorRef.current;
        const currentContent = contentRef.current;
        const currentOnChange = onChangeRef.current;

        if (!currentEditor) return;

        // Serialize and postprocess to normalize block equation format
        const rawMd = currentEditor.api.markdown.serialize({ value });
        const md = postprocessMathDelimiters(rawMd);
        if (md !== currentContent) {
          // Update cache with the serialized content and current nodes
          // This keeps the cache in sync during WYSIWYG editing
          updateCacheFromMarkdown(md, value);
          currentOnChange(md);
        }
      }, 300),
    [] // Empty deps - function uses refs for latest values
  );

  // Cleanup debounce on unmount
  useEffect(() => {
    return () => {
      debouncedSerialize.cancel();
    };
  }, [debouncedSerialize]);

  // Sync content from Source view back to Plate if content changed externally or in source mode
  useEffect(() => {
    // Optimization: Skip deserialization when in source mode to prevent lag.
    if (editorViewMode === 'source') {
      prevEditorViewMode.current = editorViewMode;
      return;
    }

    // Check if cache is already valid for this content (fast hash comparison)
    const cacheValid = isCacheValid(content);
    
    // Only deserialize when switching FROM source mode or when content changed
    // Note: We already checked editorViewMode !== 'source' above, so this is just checking prevEditorViewMode
    const isSwitchingFromSource = prevEditorViewMode.current === 'source';
    
    // Check if content has actually changed using cache validity
    // Skip if cache is valid AND we're not switching from source mode
    if (cacheValid && !isSwitchingFromSource) {
      prevEditorViewMode.current = editorViewMode;
      return;
    }

    if (!isUpdatingFromPlate.current) {
      // Capture values at scheduling time to avoid stale closures
      const contentToDeserialize = content;

      // Defer deserialization to prevent blocking the main thread
      // Use requestIdleCallback if available for better performance, otherwise setTimeout
      const performDeserialization = () => {
        
        // Use optimized processor with caching and differential updates
        // This only re-processes chunks that have changed
        const { nodes, unchanged } = processMarkdownDiff(contentToDeserialize);
        
        // Skip setValue if:
        // 1. Content is unchanged (cache hit) AND not switching from source, OR
        // 2. The nodes reference is the same as what we already set (avoids expensive setValue)
        if (unchanged && !isSwitchingFromSource) {
          return;
        }
        
        // Skip setValue if we'd be setting the exact same nodes array (by reference)
        // This is the key optimization for mode switches when content hasn't changed
        if (nodes === lastSetNodesRef.current) {
          console.log('[PlateEditor] Skipping setValue - same nodes reference');
          lastDeserializedContent.current = contentToDeserialize;
          return;
        }
        
        editor.tf.setValue(nodes);
        lastSetNodesRef.current = nodes;
        lastDeserializedContent.current = contentToDeserialize;
      };

      let cleanup: (() => void) | undefined;

      if (typeof (window as any).requestIdleCallback !== 'undefined' && isSwitchingFromSource) {
        // Use requestIdleCallback for mode switches to avoid blocking
        // Reduced timeout from 1000ms to 150ms for faster perceived response
        const idleCallbackId = (window as any).requestIdleCallback(performDeserialization, { timeout: 150 });
        cleanup = () => {
          if (typeof (window as any).cancelIdleCallback !== 'undefined') {
            (window as any).cancelIdleCallback(idleCallbackId);
          }
        };
      } else {
        // Use setTimeout to yield to the browser's event loop
        const timeoutId = setTimeout(performDeserialization, 0);
        cleanup = () => clearTimeout(timeoutId);
      }

      prevEditorViewMode.current = editorViewMode;

      return cleanup;
    } else {
      prevEditorViewMode.current = editorViewMode;
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
        // Use debounced serialization to reduce expensive operations during typing
        debouncedSerialize(value);
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
          {/* 
            PERFORMANCE OPTIMIZATION: Keep both editors mounted but toggle visibility with CSS.
            This avoids expensive mount/unmount cycles when switching modes.
            The Editor component renders all Slate nodes on mount which is expensive (~2s for large docs).
            Using visibility:hidden + position:absolute keeps the component in React's tree but hidden.
          */}
          <div 
            className="absolute inset-0"
            style={{ 
              visibility: editorViewMode === 'source' ? 'visible' : 'hidden',
              zIndex: editorViewMode === 'source' ? 10 : 0 
            }}
          >
            <SourceEditor
              content={content}
              onChange={(val) => {
                isUpdatingFromPlate.current = false; // Source edit
                onChange(val);
              }}
            />
          </div>
          <div 
            className="h-full"
            style={{ 
              visibility: editorViewMode !== 'source' ? 'visible' : 'hidden',
            }}
          >
            <EditorContainer>
              <Editor variant="demo" />
            </EditorContainer>
          </div>
        </div>
      </div>
    </Plate>
  );
}
