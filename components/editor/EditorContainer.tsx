"use client";

import { useStore } from "@/lib/store";
import { PlateEditor } from "@/components/plate-editor/plate-editor";
import { FileText } from "lucide-react";

export function EditorContainer() {
    const {
        activeFileId,
        files,
        updateFileContent
    } = useStore();

    const activeFile = files.find((f) => f.id === activeFileId);

    if (!activeFile) {
        return (
            <div className="h-full flex flex-col items-center justify-center text-muted-foreground p-8 bg-muted/5">
                <FileText className="h-16 w-16 mb-4 opacity-10" />
                <p className="text-sm font-medium opacity-50">Select a file from the explorer to start editing</p>
            </div>
        );
    }

    return (
        <div className="h-full flex flex-col relative w-full bg-background overflow-hidden border-l">
            <PlateEditor
                content={activeFile.content}
                onChange={(val: string) => updateFileContent(activeFile.id, val)}
            />
        </div>
    );
}
