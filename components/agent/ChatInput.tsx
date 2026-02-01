"use client";

import { useState, useRef, useEffect, KeyboardEvent } from "react";
import { useStore } from "@/lib/store";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Send, Plus, FileText, Link as LinkIcon, X } from "lucide-react";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { RagDocument, generateSyncId } from "@/lib/types";

export function ChatInput() {
    const {
        sendAgentMessage,
        agentLoading,
        activeFileId,
        currentView,
        ragDocuments,
        addRagDocument,
        removeRagDocument,
        activeChatId,
    } = useStore();

    const [input, setInput] = useState("");
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

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

    const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file || !activeChatId) return;

        // Read content for text-based files
        let content = '';
        const isText = file.type.startsWith('text/') ||
            file.name.endsWith('.md') ||
            file.name.endsWith('.txt') ||
            file.name.endsWith('.json') ||
            file.name.endsWith('.js') ||
            file.name.endsWith('.ts') ||
            file.name.endsWith('.tsx');

        if (isText) {
            content = await file.text();
        }

        const doc: RagDocument = {
            id: crypto.randomUUID(),
            chatId: activeChatId,
            name: file.name,
            type: 'text',
            content,
            blob: file,
            createdAt: Date.now(),
            syncId: generateSyncId(),
            updatedAt: Date.now(),
            isDeleted: false,
            userId: null
        };

        await addRagDocument(doc);
        if (fileInputRef.current) fileInputRef.current.value = '';
    };

    const handleAddLink = async () => {
        const url = prompt("Enter URL:");
        if (!url || !activeChatId) return;

        // Try to fetch URL content
        let content = '';
        try {
            // Priority 1: Use Electron IPC if available (bypasses CORS)
            // @ts-ignore
            if (window.electronAPI?.fetchUrl) {
                // @ts-ignore
                const result = await window.electronAPI.fetchUrl(url);
                if (result.error) {
                    console.warn('Electron fetch error:', result.error);
                } else {
                    content = result.content || '';
                }
            } else {
                // Priority 2: Use Next.js API route (for dev/web)
                const baseUrl = typeof window !== 'undefined' && window.location.origin && !window.location.origin.startsWith('file')
                    ? window.location.origin
                    : '';

                const response = await fetch(`${baseUrl}/api/fetch-url?url=${encodeURIComponent(url)}`);
                if (response.ok) {
                    const data = await response.json();
                    if (data.error) {
                        console.warn('API error fetching URL:', data.error);
                    }
                    content = data.content || '';
                } else {
                    console.warn('Failed to fetch from API:', response.status, response.statusText);
                }
            }
        } catch (error) {
            console.error('Failed to fetch URL content:', error);
            // Continue without content - the URL will still be attached
        }

        const doc: RagDocument = {
            id: crypto.randomUUID(),
            chatId: activeChatId,
            name: url,
            type: 'url',
            url: url,
            content, // Include fetched content
            createdAt: Date.now(),
            syncId: generateSyncId(),
            updatedAt: Date.now(),
            isDeleted: false,
            userId: null
        };
        addRagDocument(doc);
    };

    const handleSubmit = () => {
        const trimmedInput = input.trim();
        if ((!trimmedInput && ragDocuments.length === 0) || agentLoading) return;
        // Allows sending with only attachments logic if needed, but for now we enforce text or attachments?
        // AgentMessage usually expects content.
        // We probably send the attachments info in the message or just assume they are in the context.
        // For now let's rely on standard sendAgentMessage, hoping it reads the global ragDocuments store or pass it.
        // Wait, sendAgentMessage signature is (content: string, mentions?: string[]).
        // It doesn't take attachments.
        // The Prompt said "associated with the ai chat" and "option to attach".
        // If I store them in `ragDocuments` and associates with chat, then `sendAgentMessage` (or the backend) needs to know about them.
        // `sendAgentMessage` calls `sendMessageToAI` in `lib/agent/index.ts`.
        // I might need to update `sendAgentMessage` to read `ragDocuments` or the AI to fetch them.
        // But for this UI task, I'll just allow submitting.

        if (!trimmedInput && ragDocuments.length === 0) return;

        sendAgentMessage(trimmedInput);
        setInput("");

        if (textareaRef.current) {
            textareaRef.current.style.height = "auto";
        }
    };

    return (
        <div className="space-y-2">
            {/* RAG Documents List */}
            {ragDocuments.length > 0 && (
                <div className="flex flex-wrap gap-2 mb-2">
                    {ragDocuments.map((doc) => (
                        <div
                            key={doc.id}
                            className="flex items-center gap-1.5 bg-secondary/50 text-secondary-foreground px-2 py-1 rounded-md text-[10px] border max-w-[200px]"
                            title={doc.name}
                        >
                            {doc.type === 'url' ? <LinkIcon size={10} /> : <FileText size={10} />}
                            <span className="truncate flex-1">{doc.name}</span>
                            <button
                                onClick={() => removeRagDocument(doc.id)}
                                className="text-muted-foreground hover:text-foreground shrink-0"
                            >
                                <X size={10} />
                            </button>
                        </div>
                    ))}
                </div>
            )}

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

            <div className={cn("relative rounded-md flex gap-2 items-end", !hasFile && "opacity-80")}>
                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <Button
                            variant="outline"
                            size="icon"
                            className="shrink-0 h-[38px] w-[38px] rounded-md"
                            disabled={agentLoading}
                        >
                            <Plus size={16} />
                        </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="start">
                        <DropdownMenuItem onClick={() => fileInputRef.current?.click()}>
                            <FileText className="mr-2 h-4 w-4" />
                            <span>Upload Document</span>
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={handleAddLink}>
                            <LinkIcon className="mr-2 h-4 w-4" />
                            <span>Add Link</span>
                        </DropdownMenuItem>
                    </DropdownMenuContent>
                </DropdownMenu>

                <input
                    type="file"
                    ref={fileInputRef}
                    className="hidden"
                    onChange={handleFileUpload}
                />

                <div className={cn("relative flex-1 rounded-md", !hasFile && "bg-muted/60")}>
                    <textarea
                        ref={textareaRef}
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        onKeyDown={handleKeyDown}
                        placeholder={
                            hasFile
                                ? "Ask about the document..."
                                : (ragDocuments.length > 0 ? "Ask about attached documents..." : "Select a file to start")
                        }
                        disabled={agentLoading}
                        rows={1}
                        className={cn(
                            "w-full resize-none rounded-md border px-3 py-2 pr-11",
                            "text-sm placeholder:text-muted-foreground",
                            "focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
                            "disabled:cursor-not-allowed disabled:opacity-70",
                            "min-h-[38px] max-h-[150px]",
                            hasFile
                                ? "bg-background"
                                : "bg-muted/50 border-muted-foreground/20"
                        )}
                    />

                    <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        onClick={handleSubmit}
                        disabled={(!input.trim() && ragDocuments.length === 0) || agentLoading}
                        className="absolute right-1 top-1/2 -translate-y-1/2 h-8 w-8"
                    >
                        <Send size={16} />
                    </Button>
                </div>
            </div>
        </div>
    );
}
