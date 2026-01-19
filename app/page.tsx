"use client";

import { useStore } from "@/lib/store";
import { AppShell } from "@/components/layout/AppShell";
import { EditorContainer } from "@/components/editor/EditorContainer";
import { TemplateEditor } from "@/components/editor/TemplateEditor";
import { SettingsDialog } from "@/components/plate-editor/settings-dialog";
import { useCustomFonts } from "@/hooks/use-custom-fonts";

export default function Home() {
  const { currentView } = useStore();
  useCustomFonts();

  return (
    <>
      <AppShell>
        {currentView === 'template' ? (
          <TemplateEditor />
        ) : (
          <EditorContainer />
        )}
      </AppShell>
      <SettingsDialog />
    </>
  );
}
