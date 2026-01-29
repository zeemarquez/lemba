"use client";

import { useEffect, useState } from "react";
import { Minus, Square, X, Maximize2 } from "lucide-react";

// Check if we're in Electron
const isElectron = typeof window !== 'undefined' && !!(window as any).electronAPI?.isElectron;

export function ElectronTitleBar() {
  const [isMaximized, setIsMaximized] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);

    if (!isElectron) return;

    const api = (window as any).electronAPI;

    // Listen for maximize state changes
    api.onWindowMaximized?.((maximized: boolean) => {
      setIsMaximized(maximized);
    });
  }, []);

  // Don't render anything if not mounted or not in Electron
  if (!mounted || !isElectron) return null;

  const api = (window as any).electronAPI;

  return (
    <div
      data-electron-titlebar
      className="flex items-center justify-between h-8 bg-background border-b border-border select-none shrink-0"
      style={{
        // Make the title bar draggable (moves window)
        WebkitAppRegion: 'drag'
      } as React.CSSProperties}
    >
      {/* App title / left side */}
      <div className="flex items-center px-3 h-full">
        <span className="text-xs font-medium text-muted-foreground">
          Modern Markdown Editor
        </span>
      </div>

      {/* Window controls - right side */}
      <div
        className="flex items-center h-full"
        style={{
          // Make buttons clickable (not draggable)
          WebkitAppRegion: 'no-drag'
        } as React.CSSProperties}
      >
        {/* Minimize */}
        <button
          onClick={() => api.windowMinimize()}
          className="h-full px-4 hover:bg-muted/50 transition-colors flex items-center justify-center"
          title="Minimize"
        >
          <Minus size={14} className="text-foreground/70" />
        </button>

        {/* Maximize/Restore */}
        <button
          onClick={() => api.windowMaximize()}
          className="h-full px-4 hover:bg-muted/50 transition-colors flex items-center justify-center"
          title={isMaximized ? "Restore" : "Maximize"}
        >
          {isMaximized ? (
            <Maximize2 size={12} className="text-foreground/70" />
          ) : (
            <Square size={12} className="text-foreground/70" />
          )}
        </button>

        {/* Close */}
        <button
          onClick={() => api.windowClose()}
          className="h-full px-4 hover:bg-red-500 hover:text-white transition-colors flex items-center justify-center"
          title="Close"
        >
          <X size={14} className="text-foreground/70 hover:text-white" />
        </button>
      </div>
    </div>
  );
}
