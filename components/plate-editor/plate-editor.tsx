'use client';

import { useMemo, useEffect, useRef, useCallback, useState } from 'react';
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
  processMarkdownChunked,
  updateCacheFromMarkdown,
  isCacheValid 
} from '@/lib/markdown-processor';
import { mergeFrontmatter, parseFrontmatter, type FrontmatterData } from '@/lib/frontmatter';

interface PlateEditorProps {
  content: string;
  onChange: (value: string) => void;
}

// Threshold for using async loading (characters)
const ASYNC_LOAD_THRESHOLD = 5000;

// Safe default value so we never pass undefined to usePlateEditor (avoids "undefined is not iterable" in platejs)
const DEFAULT_EDITOR_VALUE = [{ type: 'p', children: [{ text: '' }] }];

export function PlateEditor({ content, onChange }: PlateEditorProps) {
  const { editorViewMode, setActiveHeadingId } = useStore();
  const mounted = useMounted();

  const { data: frontmatterData, content: bodyContent } = useMemo(
    () => parseFrontmatter(content),
    [content]
  );
  
  // Loading state for large documents
  const [isLoading, setIsLoading] = useState(() => bodyContent.length > ASYNC_LOAD_THRESHOLD);
  const [loadProgress, setLoadProgress] = useState(0);

  // Use a ref to track if we're currently updating from Plate to avoid infinite loops
  const isUpdatingFromPlate = useRef(false);
  // Track previous editor view mode to detect actual mode switches
  const prevEditorViewMode = useRef(editorViewMode);
  // Track last deserialized content to avoid redundant deserialization
  const lastDeserializedContent = useRef<string | null>(null);
  // Track the last nodes array reference we set - to avoid redundant setValue calls
  const lastSetNodesRef = useRef<any[] | null>(null);
  // Track if initial async load has completed
  const initialLoadComplete = useRef(false);
  // Refs to store latest values for debounced function
  const editorRef = useRef<any>(null);
  const contentRef = useRef(content);
  const frontmatterRef = useRef<FrontmatterData>({});
  const onChangeRef = useRef(onChange);

  // Update refs when values change
  useEffect(() => {
    contentRef.current = content;
    frontmatterRef.current = frontmatterData;
    onChangeRef.current = onChange;
  }, [content, bodyContent, frontmatterData, onChange]);

  // Always use a safe placeholder for initial render. Never call processMarkdownDiff here:
  // - It triggers createTempEditor() which uses EditorKit; in some bundle orders EditorKit
  //   can be undefined during first paint, causing "undefined is not iterable" in platejs.
  // - Real content is applied in useEffect after mount (see effect below).
  const initialValue = useMemo(() => DEFAULT_EDITOR_VALUE, []);

  const editor = usePlateEditor({
    plugins: Array.isArray(EditorKit) ? EditorKit : [],
    value: Array.isArray(initialValue) ? initialValue : DEFAULT_EDITOR_VALUE,
  });

  // Update editor ref
  editorRef.current = editor;

  // Load real content after mount (never during first render - avoids "undefined is not iterable" in platejs)
  useEffect(() => {
    if (initialLoadComplete.current) return;

    const isSmallDoc = bodyContent.length <= ASYNC_LOAD_THRESHOLD;

    if (isSmallDoc) {
      // Small doc: sync parse after mount so createTempEditor runs outside React render
      try {
        const { nodes } = processMarkdownDiff(bodyContent);
        if (Array.isArray(nodes) && nodes.length > 0) {
          editor.tf.setValue(nodes);
          lastSetNodesRef.current = nodes;
        }
        lastDeserializedContent.current = bodyContent;
        initialLoadComplete.current = true;
        setIsLoading(false);
      } catch (e) {
        console.error('[PlateEditor] Sync load failed:', e);
        initialLoadComplete.current = true;
        setIsLoading(false);
      }
      return;
    }

    // Large doc: async chunked load
    let cancelled = false;
    const loadContentAsync = async () => {
      console.log('[PlateEditor] Starting async content load', { contentLength: bodyContent.length });
      const startTime = performance.now();
      try {
        const nodes = await processMarkdownChunked(bodyContent, (progress) => {
          if (!cancelled) setLoadProgress(Math.round(progress));
        });
        if (cancelled) return;
        console.log('[PlateEditor] Async load complete', { time: performance.now() - startTime, nodeCount: nodes.length });
        editor.tf.setValue(nodes);
        lastDeserializedContent.current = bodyContent;
        lastSetNodesRef.current = nodes;
        initialLoadComplete.current = true;
        setIsLoading(false);
      } catch (error) {
        console.error('[PlateEditor] Async load failed:', error);
        if (!cancelled) {
          const { nodes } = processMarkdownDiff(bodyContent);
          editor.tf.setValue(Array.isArray(nodes) ? nodes : DEFAULT_EDITOR_VALUE);
          lastDeserializedContent.current = bodyContent;
          lastSetNodesRef.current = nodes;
          initialLoadComplete.current = true;
          setIsLoading(false);
        }
      }
    };
    const timeoutId = setTimeout(loadContentAsync, 50);
    return () => {
      cancelled = true;
      clearTimeout(timeoutId);
    };
  }, [bodyContent, editor]);

  // Create debounced serialization function using refs to always use latest values
  const debouncedSerialize = useMemo(
    () =>
      debounce((value: any) => {
        // Use refs to get latest values at execution time
        const currentEditor = editorRef.current;
        const currentContent = contentRef.current;
        const currentFrontmatter = frontmatterRef.current;
        const currentOnChange = onChangeRef.current;

        if (!currentEditor) return;

        // Serialize and postprocess to normalize block equation format
        const rawMd = currentEditor.api.markdown.serialize({ value });
        const md = postprocessMathDelimiters(rawMd);
        const fullMd = mergeFrontmatter(md, currentFrontmatter);
        if (fullMd !== currentContent) {
          // Update cache with the serialized content and current nodes
          // This keeps the cache in sync during WYSIWYG editing
          updateCacheFromMarkdown(md, value);
          currentOnChange(fullMd);
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
    // Skip while initial async loading is in progress
    if (isLoading) {
      return;
    }
    
    // Optimization: Skip deserialization when in source mode to prevent lag.
    if (editorViewMode === 'source') {
      prevEditorViewMode.current = editorViewMode;
      return;
    }

    // Check if cache is already valid for this content (fast hash comparison)
    const cacheValid = isCacheValid(bodyContent);
    
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
      const contentToDeserialize = bodyContent;

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
  }, [bodyContent, editor, editorViewMode, isLoading]);

  // Listen for navigation events from the outline (for WYSIWYG mode)
  const handleNavigateToLine = useCallback((event: CustomEvent<{ line: number }>) => {
    // Only handle in non-source mode
    if (editorViewMode === 'source') return;
    
    const { line } = event.detail;
    const lines = bodyContent.split('\n');
    
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
              // Scroll the heading into view at the top
              const domNode = editor.api.toDOMNode(node);
              if (domNode) {
                domNode.scrollIntoView({ behavior: 'smooth', block: 'start' });
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
  }, [editorViewMode, bodyContent, editor]);

  useEffect(() => {
    window.addEventListener('navigate-to-line', handleNavigateToLine as EventListener);
    return () => {
      window.removeEventListener('navigate-to-line', handleNavigateToLine as EventListener);
    };
  }, [handleNavigateToLine]);

  // Helper function to find heading in markdown content and set active heading ID
  const findHeadingInMarkdown = useCallback((headingText: string, headingType: string) => {
    if (!bodyContent) {
      setActiveHeadingId(null);
      return;
    }

    const lines = bodyContent.split('\n');
    let inCodeBlock = false;

    // Determine the expected number of # symbols
    const level = parseInt(headingType.replace('h', '')) || 1;
    const expectedPrefix = '#'.repeat(level);

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      
      // Track code blocks to avoid parsing headings inside them
      if (line.trim().startsWith('```')) {
        inCodeBlock = !inCodeBlock;
        continue;
      }
      
      if (inCodeBlock) continue;
      
      // Match ATX-style headings with the expected level
      const match = line.match(/^(#{1,6})\s+(.+)$/);
      if (match && match[1] === expectedPrefix) {
        const text = match[2].trim();
        if (text === headingText) {
          setActiveHeadingId(`heading-${i}`);
          return;
        }
      }
    }

    // Heading not found
    setActiveHeadingId(null);
  }, [bodyContent, setActiveHeadingId]);

  // Function to find the active heading based on cursor position in Plate editor
  const findActiveHeadingFromPlate = useCallback(() => {
    if (!editor || !editor.selection || editorViewMode === 'source') {
      return;
    }

    try {
      // Find the block node that contains the cursor
      const block = editor.api.block({ at: editor.selection.anchor });
      if (!block) {
        setActiveHeadingId(null);
        return;
      }

      const [node, path] = block;
      
      // Check if the current node is a heading
      if ('type' in node && typeof node.type === 'string' && node.type.startsWith('h')) {
        // This is a heading, find it in the markdown content
        const headingText = Node.string(node).trim();
        findHeadingInMarkdown(headingText, node.type);
        return;
      }

      // Walk up the tree to find the nearest heading ancestor
      let currentPath = path;
      while (currentPath.length > 0) {
        const nodeEntry = editor.api.node({ at: currentPath });
        if (nodeEntry) {
          const [ancestor] = nodeEntry;
          if ('type' in ancestor && typeof ancestor.type === 'string' && ancestor.type.startsWith('h')) {
            const headingText = Node.string(ancestor).trim();
            findHeadingInMarkdown(headingText, ancestor.type);
            return;
          }
        }
        currentPath = currentPath.slice(0, -1);
      }

      // No heading found
      setActiveHeadingId(null);
    } catch (error) {
      // Ignore errors (e.g., invalid selection)
      setActiveHeadingId(null);
    }
  }, [editor, editorViewMode, setActiveHeadingId, findHeadingInMarkdown]);

  // Function to extract text around cursor for PDF sync
  const extractTextAroundCursor = useCallback(() => {
    if (!editor || !editor.selection || editorViewMode === 'source') {
      return '';
    }

    try {
      // Get the current block node at cursor
      const block = editor.api.block({ at: editor.selection.anchor });
      if (!block) return '';

      const [node] = block;
      
      // Get text from current node
      let text = Node.string(node).trim();
      
      // If text is too short, try to get text from surrounding nodes
      if (text.length < 20) {
        const path = editor.api.findPath(node);
        if (path) {
          // Try to get text from previous and next siblings
          const parent = editor.api.parent(path);
          if (parent) {
            const [parentNode, parentPath] = parent;
            if ('children' in parentNode && Array.isArray(parentNode.children)) {
              const currentIndex = path[path.length - 1];
              const siblings: string[] = [];
              
              // Get previous sibling
              if (currentIndex > 0) {
                const prevSibling = parentNode.children[currentIndex - 1];
                if (prevSibling) {
                  siblings.push(Node.string(prevSibling).trim());
                }
              }
              
              // Current node
              siblings.push(text);
              
              // Get next sibling
              if (currentIndex < parentNode.children.length - 1) {
                const nextSibling = parentNode.children[currentIndex + 1];
                if (nextSibling) {
                  siblings.push(Node.string(nextSibling).trim());
                }
              }
              
              text = siblings.filter(s => s.length > 0).join(' ').trim();
            }
          }
        }
      }
      
      // Extract a meaningful snippet (about 10-15 words)
      const words = text.split(/\s+/).filter(w => w.length > 0);
      if (words.length === 0) return '';
      
      // Get middle portion of words
      const start = Math.max(0, Math.floor(words.length / 2) - 5);
      const end = Math.min(words.length, start + 10);
      const snippet = words.slice(start, end).join(' ');
      
      return snippet.trim();
    } catch (error) {
      return '';
    }
  }, [editor, editorViewMode]);

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

  // Debounced function to update active heading
  const debouncedFindActiveHeading = useMemo(
    () => debounce(() => {
      findActiveHeadingFromPlate();
    }, 100),
    [findActiveHeadingFromPlate]
  );

  // Track cursor position changes in Plate editor
  useEffect(() => {
    if (editorViewMode === 'source' || !editor) return;

    const updateActiveHeading = () => {
      if (editor && editor.selection) {
        debouncedFindActiveHeading();
      }
    };

    // Initial update
    updateActiveHeading();

    // Listen for selection changes via the onChange handler
    // This is handled in the onChange callback below

    // Cleanup
    return () => {
      debouncedFindActiveHeading.cancel();
      debouncedSyncPdfPreview.cancel();
    };
  }, [editor, editorViewMode, debouncedFindActiveHeading, debouncedSyncPdfPreview]);

  if (!mounted) {
    return (
      <div className="h-full w-full bg-background" />
    );
  }

  return (
    <Plate
      editor={editor}
      onChange={({ value }) => {
        // Don't process changes while still loading
        if (isLoading) return;
        
        isUpdatingFromPlate.current = true;
        // Use debounced serialization to reduce expensive operations during typing
        debouncedSerialize(value);
        
        // Update active heading when selection changes
        if (editorViewMode !== 'source' && editor.selection) {
          debouncedFindActiveHeading();
          
          // Sync PDF preview with cursor position
          const text = extractTextAroundCursor();
          if (text) {
            debouncedSyncPdfPreview(text);
          }
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
          {/* Loading overlay for large documents */}
          {isLoading && (
            <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-background/80 backdrop-blur-sm">
              <div className="flex flex-col items-center gap-4">
                <div className="h-2 w-48 overflow-hidden rounded-full bg-muted">
                  <div 
                    className="h-full bg-primary transition-all duration-150 ease-out"
                    style={{ width: `${loadProgress}%` }}
                  />
                </div>
                <p className="text-sm text-muted-foreground">
                  Loading document... {loadProgress}%
                </p>
              </div>
            </div>
          )}
          
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
              content={bodyContent}
              onChange={(val) => {
                isUpdatingFromPlate.current = false; // Source edit
                const fullMd = mergeFrontmatter(val, frontmatterRef.current);
                onChange(fullMd);
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
