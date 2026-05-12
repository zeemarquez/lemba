"use client";

import { useEffect } from "react";
import { useStore } from "@/lib/store";
import { EditorWorkspace } from "@/components/layout/EditorWorkspace";

export default function Home() {
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem("markdown-editor-storage");
      if (raw) {
        const parsed = JSON.parse(raw);
        const state = parsed?.state ?? parsed;
        console.log("[PersistedStateShape]", {
          openTabsIsArray: Array.isArray(state?.openTabs),
          openTabsLength: Array.isArray(state?.openTabs) ? state.openTabs.length : null,
          chatsIsObject: !!state?.chats && typeof state.chats === "object" && !Array.isArray(state.chats),
          agentMessagesIsArray: Array.isArray(state?.agentMessages),
          agentMentionedFilesIsArray: Array.isArray(state?.agentMentionedFiles),
          pendingDiffsIsObject:
            !!state?.pendingDiffs && typeof state.pendingDiffs === "object" && !Array.isArray(state.pendingDiffs),
        });
      } else {
        console.log("[PersistedStateShape]", { hasStorage: false });
      }
    } catch (error) {
      console.error("[PersistedStateShape] Failed to parse", error);
    }

    try {
      const state = useStore.getState();
      console.log("[CurrentStateShape]", {
        openTabsIsArray: Array.isArray(state.openTabs),
        openTabsLength: state.openTabs?.length ?? null,
        chatsIsObject: !!state.chats && typeof state.chats === "object" && !Array.isArray(state.chats),
        agentMessagesIsArray: Array.isArray(state.agentMessages),
        agentMentionedFilesIsArray: Array.isArray(state.agentMentionedFiles),
        pendingDiffsIsObject: !!state.pendingDiffs && typeof state.pendingDiffs === "object" && !Array.isArray(state.pendingDiffs),
        currentView: state.currentView,
        editorViewMode: state.editorViewMode,
      });
    } catch (error) {
      console.error("[CurrentStateShape] Failed to read", error);
    }

    return () => {};
  }, []);

  return <EditorWorkspace />;
}
