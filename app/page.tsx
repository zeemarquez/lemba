"use client";

import { useEffect } from "react";
import { useStore } from "@/lib/store";
import { AppShell } from "@/components/layout/AppShell";
import { EditorContainer } from "@/components/editor/EditorContainer";
import { TemplateEditor } from "@/components/editor/TemplateEditor";
import { SettingsDialog } from "@/components/plate-editor/settings-dialog";
import { useCustomFonts } from "@/hooks/use-custom-fonts";

export default function Home() {
  const { currentView, uiIconSize, uiFontSize } = useStore();
  useCustomFonts();

  // Apply UI size classes to body
  useEffect(() => {
    const body = document.body;
    // Remove old classes
    body.classList.remove('ui-icon-small', 'ui-icon-normal', 'ui-icon-big');
    body.classList.remove('ui-font-small', 'ui-font-normal', 'ui-font-big');
    // Add new classes
    body.classList.add(`ui-icon-${uiIconSize}`);
    body.classList.add(`ui-font-${uiFontSize}`);
  }, [uiIconSize, uiFontSize]);

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
