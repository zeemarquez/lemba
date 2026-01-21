"use client";

import { useEffect } from "react";

export function DisableBrowserZoom() {
    useEffect(() => {
        // Prevent Ctrl/Cmd + wheel zoom
        const handleWheel = (e: WheelEvent) => {
            if (e.ctrlKey || e.metaKey) {
                e.preventDefault();
            }
        };

        // Prevent Ctrl/Cmd + +/-/0 zoom shortcuts
        const handleKeydown = (e: KeyboardEvent) => {
            if ((e.ctrlKey || e.metaKey) && ["+", "-", "=", "0"].includes(e.key)) {
                e.preventDefault();
            }
        };

        window.addEventListener("wheel", handleWheel, { passive: false });
        window.addEventListener("keydown", handleKeydown);

        return () => {
            window.removeEventListener("wheel", handleWheel);
            window.removeEventListener("keydown", handleKeydown);
        };
    }, []);

    return null;
}
