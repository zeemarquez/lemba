"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useStore } from "@/lib/store";
import { EditorWorkspace } from "@/components/layout/EditorWorkspace";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function paramFileId(params: { fileId?: string | string[] }): string {
  const raw = params?.fileId;
  if (typeof raw === "string") return raw;
  if (Array.isArray(raw) && raw[0]) return raw[0];
  return "";
}

export default function FileByIdPage() {
  const params = useParams();
  const router = useRouter();
  const fileId = paramFileId(params as { fileId?: string | string[] });
  const openFileBySyncIdExclusive = useStore((s) => s.openFileBySyncIdExclusive);
  const [phase, setPhase] = useState<"loading" | "ready" | "missing" | "invalid">("loading");

  useEffect(() => {
    if (!fileId || !UUID_RE.test(fileId)) {
      setPhase("invalid");
      return;
    }

    let cancelled = false;
    (async () => {
      const result = await openFileBySyncIdExclusive(fileId);
      if (cancelled) return;
      if (result === "ok") {
        setPhase("ready");
      } else {
        setPhase("missing");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [fileId, openFileBySyncIdExclusive]);

  useEffect(() => {
    if (phase === "invalid") {
      router.replace("/");
    }
  }, [phase, router]);

  if (phase === "loading" || phase === "invalid") {
    return (
      <div className="flex h-full w-full items-center justify-center text-sm text-muted-foreground">
        {phase === "loading" ? "Opening document…" : null}
      </div>
    );
  }

  if (phase === "missing") {
    return (
      <div className="flex h-full w-full flex-col items-center justify-center gap-3 p-6 text-center">
        <p className="text-sm text-muted-foreground max-w-md">
          This document is not available on this device yet, or the link is invalid. Open the editor
          while signed in so cloud sync can finish, then try the link again.
        </p>
        <button
          type="button"
          className="text-sm underline underline-offset-2"
          onClick={() => router.replace("/")}
        >
          Go to workspace
        </button>
      </div>
    );
  }

  return <EditorWorkspace />;
}
