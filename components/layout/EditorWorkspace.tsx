"use client";

import { useEffect } from "react";
import { useStore } from "@/lib/store";
import { AppShell } from "@/components/layout/AppShell";
import { EditorContainer } from "@/components/editor/EditorContainer";
import { TemplateEditor } from "@/components/editor/TemplateEditor";
import { SettingsDialog } from "@/components/plate-editor/settings-dialog";
import { useCustomFonts } from "@/hooks/use-custom-fonts";

/**
 * Main editor shell (file + template views) shared by `/` and `/[fileId]` deep links.
 */
export function EditorWorkspace() {
  const { currentView, uiIconSize, uiFontSize } = useStore();
  useCustomFonts();

  useEffect(() => {
    const handleError = (event: ErrorEvent) => {
      console.error("[GlobalError]", {
        message: event.message,
        filename: event.filename,
        lineno: event.lineno,
        colno: event.colno,
        stack: event.error?.stack,
      });
    };

    const handleRejection = (event: PromiseRejectionEvent) => {
      console.error("[UnhandledRejection]", {
        reason: event.reason,
        stack: event.reason?.stack,
      });
    };

    window.addEventListener("error", handleError);
    window.addEventListener("unhandledrejection", handleRejection);

    return () => {
      window.removeEventListener("error", handleError);
      window.removeEventListener("unhandledrejection", handleRejection);
    };
  }, []);

  useEffect(() => {
    const body = document.body;
    body.classList.remove("ui-icon-small", "ui-icon-normal", "ui-icon-big");
    body.classList.remove("ui-font-small", "ui-font-normal", "ui-font-big");
    body.classList.add(`ui-icon-${uiIconSize}`);
    body.classList.add(`ui-font-${uiFontSize}`);
  }, [uiIconSize, uiFontSize]);

  return (
    <>
      <AppShell>
        {currentView === "template" ? <TemplateEditor /> : <EditorContainer />}
      </AppShell>
      <SettingsDialog />
    </>
  );
}
