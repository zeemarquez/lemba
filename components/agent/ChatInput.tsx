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

    const handleSubmit = () => {
        const trimmedInput = input.trim();
        if (!trimmedInput || agentLoading) return;

        sendAgentMessage(trimmedInput);
        setInput("");

        if (textareaRef.current) {
            textareaRef.current.style.height = "auto";
        }
    };

    const activeFileName =
        currentView === "file" && activeFileId
            ? activeFileId.split("/").pop() || activeFileId
            : null;

    return (
        <div className="space-y-2">
            {activeFileName && (
                <div className="text-[10px] text-muted-foreground">
                    Using document: <span className="font-medium text-foreground">{activeFileName}</span>
                </div>
            )}

            <div className="relative">
                <textarea
                    ref={textareaRef}
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder={
                        activeFileName
                            ? `Ask about ${activeFileName}...`
                            : "Open a document to ask the AI about it..."
                    }
                    disabled={agentLoading}
                    rows={1}
                    className={cn(
                        "w-full resize-none rounded-md border bg-background px-3 py-2 pr-10",
                        "text-sm placeholder:text-muted-foreground",
                        "focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
                        "disabled:cursor-not-allowed disabled:opacity-50",
                        "min-h-[38px] max-h-[150px]"
                    )}
                />

                <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    onClick={handleSubmit}
                    disabled={!input.trim() || agentLoading}
                    className="absolute right-1 bottom-1 h-7 w-7"
                >
                    <Send size={14} />
                </Button>
            </div>

            <div className="text-[10px] text-muted-foreground">
                Press <kbd className="rounded bg-muted px-1 py-0.5 font-mono">Enter</kbd> to send,{" "}
                <kbd className="ml-1 rounded bg-muted px-1 py-0.5 font-mono">Shift+Enter</kbd> for new line
            </div>
        </div>
    );
}
