'use client';

import { useMemo, useEffect, useRef } from 'react';
import { createPlateEditor, Plate, usePlateEditor } from 'platejs/react';
import type { Value } from 'platejs';
import { useMounted } from '@/hooks/use-mounted';

import { HeaderFooterEditorKit } from '@/components/plate-editor/header-footer-editor-kit';
import { Editor, EditorContainer } from '@/components/plate-ui/editor';
import { FixedToolbar } from '@/components/plate-ui/fixed-toolbar';
import { HeaderFooterToolbarButtons } from '@/components/plate-ui/header-footer-toolbar-buttons';

interface HeaderFooterPlateEditorProps {
  content: string;
  onChange: (value: string) => void;
  placeholder?: string;
}

// Try to parse content as JSON (Plate Value), fallback to markdown deserialization
function parseContent(content: string, tempEditor: ReturnType<typeof createPlateEditor>): Value {
  if (!content) {
    return [{ type: 'p', children: [{ text: '' }] }];
  }
  
  // Try JSON first (new format with alignment preserved)
  try {
    const parsed = JSON.parse(content);
    if (Array.isArray(parsed) && parsed.length > 0) {
      return parsed as Value;
    }
  } catch {
    // Not JSON, try markdown
  }
  
  // Fallback to markdown deserialization (legacy format)
  return tempEditor.api.markdown.deserialize(content);
}

export function HeaderFooterPlateEditor({ content, onChange, placeholder }: HeaderFooterPlateEditorProps) {
  const mounted = useMounted();
  const isUpdatingFromPlate = useRef(false);

  const initialValue = useMemo(() => {
    const tempEditor = createPlateEditor({ plugins: HeaderFooterEditorKit });
    return parseContent(content, tempEditor);
  }, []);

  const editor = usePlateEditor({
    plugins: HeaderFooterEditorKit,
    value: initialValue,
  });

  // Sync content from external changes
  useEffect(() => {
    if (!isUpdatingFromPlate.current) {
      const tempEditor = createPlateEditor({ plugins: HeaderFooterEditorKit });
      const newValue = parseContent(content, tempEditor);
      editor.tf.setValue(newValue);
    }
  }, [content, editor]);

  if (!mounted) {
    return (
      <div className="h-full w-full bg-muted/50 rounded-xl border border-border" />
    );
  }

  return (
    <Plate
      editor={editor}
      onChange={({ value }) => {
        isUpdatingFromPlate.current = true;
        // Store as JSON to preserve alignment and other properties
        const json = JSON.stringify(value);
        if (json !== content) {
          onChange(json);
        }
        setTimeout(() => {
          isUpdatingFromPlate.current = false;
        }, 0);
      }}
    >
      <div className="flex flex-col relative w-full overflow-hidden rounded-xl border border-border bg-background">
        <FixedToolbar className="border-b border-border rounded-t-xl">
          <HeaderFooterToolbarButtons />
        </FixedToolbar>

        <EditorContainer className="min-h-[160px] max-h-[280px]">
          <Editor 
            variant="none" 
            className="px-4 py-3 text-sm min-h-[160px]"
            placeholder={placeholder || "Type something..."}
          />
        </EditorContainer>
      </div>
    </Plate>
  );
}
