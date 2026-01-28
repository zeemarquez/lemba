"use client";

import { useStore } from "@/lib/store";
import { PlateEditor } from "@/components/plate-editor/plate-editor";
import { FileText } from "lucide-react";
import { debounce } from "lodash";
import { useMemo, useEffect } from "react";

export function EditorContainer() {
    const {
        activeFileId,
        files,
        updateFileContent,
        saveFile
    } = useStore();

    const activeFile = files.find((f) => f.id === activeFileId);

    // Create a debounced save function
    const debouncedSave = useMemo(
        () => debounce((id: string, content: string) => {
            saveFile(id, content);
        }, 1000),
        [saveFile]
    );

    // Cleanup debounce on unmount
    useEffect(() => {
        return () => {
            debouncedSave.cancel();
        };
    }, [debouncedSave]);

    if (!activeFile) {
        return (
            <div className="h-full flex flex-col items-center justify-center text-muted-foreground p-8 bg-muted/5">
                <FileText className="h-16 w-16 mb-4 opacity-10" />
                <p className="text-sm font-medium opacity-50">Select a file from the explorer to start editing</p>
            </div>
        );
    }

    return (
        <div className="h-full flex flex-col relative w-full bg-background overflow-hidden">
            <PlateEditor
                key={activeFile.id}
                content={activeFile.content}
                onChange={(val: string) => {
                    updateFileContent(activeFile.id, val);
                    debouncedSave(activeFile.id, val);
                }}
            />
        </div>
    );
}
