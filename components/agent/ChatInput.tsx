"use client";

import { useState, useRef, useEffect, KeyboardEvent, useCallback } from "react";
import { useStore } from "@/lib/store";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Send, FileText, X } from "lucide-react";
import { FileMentionSelector } from "./FileMentionSelector";

export function ChatInput() {
    const {
        sendAgentMessage,
        agentLoading,
        agentMentionedFiles,
        setAgentMentionedFiles,
        files,
        fileTree,
    } = useStore();

    const [input, setInput] = useState("");
    const [showMentionSelector, setShowMentionSelector] = useState(false);
    const [mentionQuery, setMentionQuery] = useState("");
    const [mentionStartIndex, setMentionStartIndex] = useState(-1);
    const [selectedMentions, setSelectedMentions] = useState<string[]>([]);
    
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const mentionSelectorRef = useRef<HTMLDivElement>(null);

    // Auto-resize textarea
    useEffect(() => {
        const textarea = textareaRef.current;
        if (textarea) {
            textarea.style.height = 'auto';
            textarea.style.height = Math.min(textarea.scrollHeight, 150) + 'px';
        }
    }, [input]);

    // Close mention selector on outside click
    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (mentionSelectorRef.current && !mentionSelectorRef.current.contains(e.target as Node)) {
                setShowMentionSelector(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
        const value = e.target.value;
        const cursorPosition = e.target.selectionStart;
        
        setInput(value);

        // Check for @ mention trigger
        const textBeforeCursor = value.slice(0, cursorPosition);
        const lastAtIndex = textBeforeCursor.lastIndexOf('@');
        
        if (lastAtIndex !== -1) {
            const textAfterAt = textBeforeCursor.slice(lastAtIndex + 1);
            // Check if there's no space between @ and cursor (still typing the mention)
            if (!textAfterAt.includes(' ') && !textAfterAt.includes('\n')) {
                setShowMentionSelector(true);
                setMentionQuery(textAfterAt);
                setMentionStartIndex(lastAtIndex);
                return;
            }
        }
        
        setShowMentionSelector(false);
        setMentionQuery("");
    };

    const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
        // Submit on Enter (without shift)
        if (e.key === 'Enter' && !e.shiftKey && !showMentionSelector) {
            e.preventDefault();
            handleSubmit();
        }
        
        // Close mention selector on Escape
        if (e.key === 'Escape' && showMentionSelector) {
            e.preventDefault();
            setShowMentionSelector(false);
        }
    };

    const handleSelectFile = useCallback((fileId: string) => {
        // Replace the @query with the file mention
        const beforeMention = input.slice(0, mentionStartIndex);
        const afterCursor = input.slice(textareaRef.current?.selectionStart || input.length);
        const fileName = fileId.split('/').pop() || fileId;
        
        const newInput = `${beforeMention}@${fileName} ${afterCursor}`;
        setInput(newInput);
        
        // Add to selected mentions
        if (!selectedMentions.includes(fileId)) {
            setSelectedMentions([...selectedMentions, fileId]);
        }
        
        setShowMentionSelector(false);
        setMentionQuery("");
        
        // Focus back on textarea
        setTimeout(() => textareaRef.current?.focus(), 0);
    }, [input, mentionStartIndex, selectedMentions]);

    const handleRemoveMention = (fileId: string) => {
        setSelectedMentions(selectedMentions.filter(id => id !== fileId));
    };

    const handleSubmit = () => {
        const trimmedInput = input.trim();
        if (!trimmedInput || agentLoading) return;
        
        sendAgentMessage(trimmedInput, selectedMentions);
        setInput("");
        setSelectedMentions([]);
        
        // Reset textarea height
        if (textareaRef.current) {
            textareaRef.current.style.height = 'auto';
        }
    };

    return (
        <div className="space-y-2">
            {/* Selected file mentions */}
            {selectedMentions.length > 0 && (
                <div className="flex flex-wrap gap-1">
                    {selectedMentions.map((fileId) => {
                        const fileName = fileId.split('/').pop() || fileId;
                        return (
                            <span
                                key={fileId}
                                className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs bg-primary/10 text-primary"
                            >
                                <FileText size={12} />
                                {fileName}
                                <button
                                    type="button"
                                    onClick={() => handleRemoveMention(fileId)}
                                    className="ml-0.5 hover:text-primary/70"
                                >
                                    <X size={12} />
                                </button>
                            </span>
                        );
                    })}
                </div>
            )}

            {/* Input area */}
            <div className="relative">
                <textarea
                    ref={textareaRef}
                    value={input}
                    onChange={handleInputChange}
                    onKeyDown={handleKeyDown}
                    placeholder="Ask about your documents... (@ to mention files)"
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

                {/* File mention selector dropdown */}
                {showMentionSelector && (
                    <div ref={mentionSelectorRef} className="absolute bottom-full left-0 mb-1 w-full z-50">
                        <FileMentionSelector
                            query={mentionQuery}
                            onSelect={handleSelectFile}
                            onClose={() => setShowMentionSelector(false)}
                        />
                    </div>
                )}
            </div>

            <div className="text-[10px] text-muted-foreground">
                Press <kbd className="px-1 py-0.5 rounded bg-muted font-mono">Enter</kbd> to send, 
                <kbd className="px-1 py-0.5 rounded bg-muted font-mono ml-1">Shift+Enter</kbd> for new line
            </div>
        </div>
    );
}
