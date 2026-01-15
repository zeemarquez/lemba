'use client';

import { useMemo, useEffect, useRef } from 'react';
import { createPlateEditor, Plate, usePlateEditor } from 'platejs/react';
import { useStore } from '@/lib/store';

import { EditorKit } from '@/components/plate-editor/editor-kit';
import { SettingsDialog } from '@/components/plate-editor/settings-dialog';
import { Editor, EditorContainer } from '@/components/plate-ui/editor';
import { FixedToolbar } from '@/components/plate-ui/fixed-toolbar';
import { FixedToolbarButtons } from '@/components/plate-ui/fixed-toolbar-buttons';
import { SourceEditor } from '@/components/editor/SourceEditor';

interface PlateEditorProps {
  content: string;
  onChange: (value: string) => void;
}

export function PlateEditor({ content, onChange }: PlateEditorProps) {
  const { editorViewMode } = useStore();

  // Use a ref to track if we're currently updating from Plate to avoid infinite loops
  const isUpdatingFromPlate = useRef(false);

  const initialValue = useMemo(() => {
    const tempEditor = createPlateEditor({ plugins: EditorKit });
    return tempEditor.api.markdown.deserialize(content);
  }, []); // Only once

  const editor = usePlateEditor({
    plugins: EditorKit,
    value: initialValue,
  });

  // Sync content from Source view back to Plate if content changed externally or in source mode
  useEffect(() => {
    if (!isUpdatingFromPlate.current) {
      const newValue = editor.api.markdown.deserialize(content);
      editor.tf.setValue(newValue);
    }
  }, [content, editor]);

  return (
    <Plate
      editor={editor}
      onChange={({ value }) => {
        isUpdatingFromPlate.current = true;
        const md = editor.api.markdown.serialize({ value });
        if (md !== content) {
          onChange(md);
        }
        isUpdatingFromPlate.current = false;
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

      <SettingsDialog />
    </Plate>
  );
}
