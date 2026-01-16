"use client";

import { useStore } from "@/lib/store";
import { AppShell } from "@/components/layout/AppShell";
import { EditorContainer } from "@/components/editor/EditorContainer";
import { TemplateEditor } from "@/components/editor/TemplateEditor";

export default function Home() {
  const { currentView } = useStore();

  return (
    <AppShell>
      {currentView === 'template' ? (
        <TemplateEditor />
      ) : (
        <EditorContainer />
      )}
    </AppShell>
  );
}
