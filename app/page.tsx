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

  useEffect(() => {
    const handleError = (event: ErrorEvent) => {
      console.error('[GlobalError]', {
        message: event.message,
        filename: event.filename,
        lineno: event.lineno,
        colno: event.colno,
        stack: event.error?.stack,
      });
    };

    const handleRejection = (event: PromiseRejectionEvent) => {
      console.error('[UnhandledRejection]', {
        reason: event.reason,
        stack: event.reason?.stack,
      });
    };

    window.addEventListener('error', handleError);
    window.addEventListener('unhandledrejection', handleRejection);

    // Debug persisted and current store shapes (avoid logging sensitive data)
    try {
      const raw = window.localStorage.getItem('markdown-editor-storage');
      if (raw) {
        const parsed = JSON.parse(raw);
        const state = parsed?.state ?? parsed;
        console.log('[PersistedStateShape]', {
          openTabsIsArray: Array.isArray(state?.openTabs),
          openTabsLength: Array.isArray(state?.openTabs) ? state.openTabs.length : null,
          chatsIsObject: !!state?.chats && typeof state.chats === 'object' && !Array.isArray(state.chats),
          agentMessagesIsArray: Array.isArray(state?.agentMessages),
          agentMentionedFilesIsArray: Array.isArray(state?.agentMentionedFiles),
          pendingDiffsIsObject: !!state?.pendingDiffs && typeof state.pendingDiffs === 'object' && !Array.isArray(state.pendingDiffs),
        });
      } else {
        console.log('[PersistedStateShape]', { hasStorage: false });
      }
    } catch (error) {
      console.error('[PersistedStateShape] Failed to parse', error);
    }

    try {
      const state = useStore.getState();
      console.log('[CurrentStateShape]', {
        openTabsIsArray: Array.isArray(state.openTabs),
        openTabsLength: state.openTabs?.length ?? null,
        chatsIsObject: !!state.chats && typeof state.chats === 'object' && !Array.isArray(state.chats),
        agentMessagesIsArray: Array.isArray(state.agentMessages),
        agentMentionedFilesIsArray: Array.isArray(state.agentMentionedFiles),
        pendingDiffsIsObject: !!state.pendingDiffs && typeof state.pendingDiffs === 'object' && !Array.isArray(state.pendingDiffs),
        currentView: state.currentView,
        editorViewMode: state.editorViewMode,
      });
    } catch (error) {
      console.error('[CurrentStateShape] Failed to read', error);
    }

    return () => {
      window.removeEventListener('error', handleError);
      window.removeEventListener('unhandledrejection', handleRejection);
    };
  }, []);

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
