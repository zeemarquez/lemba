"use client";

import { useState, useRef, useEffect, KeyboardEvent } from "react";
import { useStore } from "@/lib/store";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Send } from "lucide-react";

export function ChatInput() {
    const {
        sendAgentMessage,
        agentLoading,
        activeFileId,
        currentView,
    } = useStore();

    const [input, setInput] = useState("");
    const textareaRef = useRef<HTMLTextAreaElement>(null);

    // Auto-resize textarea
    useEffect(() => {
        const textarea = textareaRef.current;
        if (textarea) {
            textarea.style.height = "auto";
            textarea.style.height = Math.min(textarea.scrollHeight, 150) + "px";
        }
    }, [input]);

    const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
        if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            handleSubmit();
        }
    };

    const hasFile = currentView === "file" && !!activeFileId;
    const activeFileName = hasFile
        ? (activeFileId?.split("/").pop() || activeFileId)
        : null;

    const handleSubmit = () => {
        const trimmedInput = input.trim();
        if (!trimmedInput || agentLoading || !hasFile) return;

        sendAgentMessage(trimmedInput);
        setInput("");

        if (textareaRef.current) {
            textareaRef.current.style.height = "auto";
        }
    };

    return (
        <div className="space-y-2">
            {hasFile ? (
                <div className="text-[10px] text-muted-foreground">
                    Let&apos;s work on{" "}
                    <span className="font-medium text-foreground bg-primary/10 text-primary px-1.5 py-0.5 rounded">
                        {activeFileName}
                    </span>
                </div>
            ) : (
                <div className="text-[10px] text-muted-foreground">
                    Select a file
                </div>
            )}

            <div className={cn("relative rounded-md", !hasFile && "bg-muted/60")}>
                <textarea
                    ref={textareaRef}
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder={
                        hasFile
                            ? "Ask about the document..."
                            : "Select a file"
                    }
                    disabled={agentLoading || !hasFile}
                    rows={1}
                    className={cn(
                        "w-full resize-none rounded-md border px-3 py-2 pr-11",
                        "text-sm placeholder:text-muted-foreground",
                        "focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
                        "disabled:cursor-not-allowed disabled:opacity-70",
                        "min-h-[38px] max-h-[150px]",
                        hasFile
                            ? "bg-background"
                            : "bg-muted/50 border-muted-foreground/20 cursor-not-allowed"
                    )}
                />

                <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    onClick={handleSubmit}
                    disabled={!input.trim() || agentLoading || !hasFile}
                    className="absolute right-1 top-1/2 -translate-y-1/2 h-8 w-8"
                >
                    <Send size={16} />
                </Button>
            </div>
        </div>
    );
}
