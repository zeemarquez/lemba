"use client";

import { useState, useMemo } from "react";
import { useStore } from "@/lib/store";
import { cn } from "@/lib/utils";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { Trash2, Bot, Check, X } from "lucide-react";
import { ChatInput } from "./ChatInput";
import { ChatMessage } from "./ChatMessage";
import { DiffPreview } from "./DiffPreview";

export function AgentPanel() {
    const {
        agentMessages,
        pendingDiffs,
        clearAgentMessages,
        agentLoading,
        agentError,
        approveDiff,
        rejectDiff,
    } = useStore();

    const [isApproving, setIsApproving] = useState(false);

    // Get all pending diffs
    const pendingDiffsList = useMemo(() => {
        return Object.values(pendingDiffs).filter(d => d.status === 'pending');
    }, [pendingDiffs]);

    const hasPendingDiffs = pendingDiffsList.length > 0;

    // Accept all pending diffs
    const handleAcceptAll = async () => {
        setIsApproving(true);
        try {
            for (const diff of pendingDiffsList) {
                await approveDiff(diff.id);
            }
        } finally {
            setIsApproving(false);
        }
    };

    // Discard all pending diffs
    const handleDiscardAll = () => {
        for (const diff of pendingDiffsList) {
            rejectDiff(diff.id);
        }
    };

    return (
        <div className="h-full flex flex-col overflow-hidden">
            {/* Header */}
            <div className="p-3 border-b flex items-center justify-between shrink-0">
                <div className="flex items-center gap-2">
                    <Bot size={16} className="text-muted-foreground" />
                    <span className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground">
                        AI Assistant
                    </span>
                </div>
                {agentMessages.length > 0 && (
                    <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6"
                        onClick={clearAgentMessages}
                        title="Clear conversation"
                    >
                        <Trash2 size={14} />
                    </Button>
                )}
            </div>

            {/* Messages Area */}
            <ScrollArea className="flex-1 min-h-0">
                <div className="p-3 space-y-3 overflow-hidden">
                    {agentMessages.length === 0 ? (
                        <EmptyState />
                    ) : (
                        agentMessages.map((message) => (
                            <ChatMessage key={message.id} message={message} />
                        ))
                    )}

                    {/* Loading indicator */}
                    {agentLoading && (
                        <div className="flex items-center gap-2 text-muted-foreground text-sm">
                            <div className="flex space-x-1">
                                <div className="w-2 h-2 bg-muted-foreground rounded-full animate-bounce [animation-delay:-0.3s]" />
                                <div className="w-2 h-2 bg-muted-foreground rounded-full animate-bounce [animation-delay:-0.15s]" />
                                <div className="w-2 h-2 bg-muted-foreground rounded-full animate-bounce" />
                            </div>
                            <span>Thinking...</span>
                        </div>
                    )}

                    {/* Error message */}
                    {agentError && (
                        <div className="p-2 rounded-md bg-destructive/10 text-destructive text-xs">
                            {agentError}
                        </div>
                    )}
                </div>
            </ScrollArea>

            {/* Pending Changes Section - above input */}
            {hasPendingDiffs && (
                <div className="border-t bg-amber-500/5 shrink-0 overflow-hidden">
                    <div className="px-3 py-2">
                        <div className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground mb-2">
                            Pending Changes ({pendingDiffsList.length})
                        </div>
                        <div className="space-y-1 max-h-[120px] overflow-y-auto">
                            {pendingDiffsList.map(diff => (
                                <DiffPreview key={diff.id} diff={diff} compact />
                            ))}
                        </div>
                    </div>
                    
                    {/* Accept/Discard All buttons */}
                    <div className="px-3 py-2 border-t border-amber-500/20 flex items-center gap-2">
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={handleDiscardAll}
                            className="flex-1 h-8 text-xs gap-1.5 text-red-600 hover:text-red-700 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/50 border-red-200 dark:border-red-800"
                        >
                            <X size={14} />
                            Discard All
                        </Button>
                        <Button
                            size="sm"
                            onClick={handleAcceptAll}
                            disabled={isApproving}
                            className="flex-1 h-8 text-xs gap-1.5 bg-green-600 hover:bg-green-700 text-white"
                        >
                            <Check size={14} />
                            {isApproving ? 'Applying...' : 'Accept All'}
                        </Button>
                    </div>
                </div>
            )}

            {/* Input Area */}
            <div className="p-3 border-t shrink-0">
                <ChatInput />
            </div>
        </div>
    );
}

function EmptyState() {
    return (
        <div className="text-center py-6 px-4">
            <div className="mx-auto w-10 h-10 rounded-full bg-muted flex items-center justify-center mb-3">
                <Bot size={20} className="text-muted-foreground" />
            </div>
            <h3 className="text-sm font-medium mb-2">AI Assistant</h3>
            <p className="text-xs text-muted-foreground mb-3">
                Ask me to help edit your markdown documents.
            </p>
            <ul className="text-[11px] text-muted-foreground space-y-1 text-left max-w-[180px] mx-auto">
                <li>• Read and analyze documents</li>
                <li>• Search for content</li>
                <li>• Propose edits with diffs</li>
                <li>• Help with formatting</li>
            </ul>
            <p className="text-[11px] text-muted-foreground mt-3">
                Use <code className="bg-muted px-1 rounded">@</code> to mention files
            </p>
        </div>
    );
}
