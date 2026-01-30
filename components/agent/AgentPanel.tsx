"use client";

import { useState, useMemo } from "react";
import { useStore } from "@/lib/store";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { MessageSquare, Bot, Check, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { ChatInput } from "./ChatInput";
import { ChatMessage } from "./ChatMessage";
import { DiffPreview } from "./DiffPreview";
import { ChatsDialog } from "./ChatsDialog";

export function AgentPanel() {
    const {
        agentMessages,
        pendingDiffs,
        getMergedPendingDiffs,
        acceptAllPending,
        rejectAllPending,
        agentLoading,
        agentCurrentStep,
        agentError,
        agentModel,
        agentReadOnly,
        agentUseOrchestration,
        setAgentModel,
        setAgentReadOnly,
        setAgentUseOrchestration,
    } = useStore();

    const [chatsDialogOpen, setChatsDialogOpen] = useState(false);
    const [isApproving, setIsApproving] = useState(false);

    // Merged pending diffs (one per file) for single accept/reject; recompute when pendingDiffs changes
    const mergedPendingDiffs = useMemo(() => {
        return Object.values(getMergedPendingDiffs());
    }, [getMergedPendingDiffs, pendingDiffs]);

    const hasPendingDiffs = mergedPendingDiffs.length > 0;

    const handleAccept = async () => {
        setIsApproving(true);
        try {
            await acceptAllPending();
        } finally {
            setIsApproving(false);
        }
    };

    const handleReject = () => {
        rejectAllPending();
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
                <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6"
                    onClick={() => setChatsDialogOpen(true)}
                    title="Chat history"
                >
                    <MessageSquare size={14} />
                </Button>
            </div>

            <ChatsDialog open={chatsDialogOpen} onOpenChange={setChatsDialogOpen} />

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
                            <span className="animate-pulse">
                                {agentCurrentStep ?? 'Thinking…'}
                            </span>
                            <div className="flex space-x-1">
                                <div className="w-2 h-2 bg-muted-foreground rounded-full animate-bounce [animation-delay:-0.3s]" />
                                <div className="w-2 h-2 bg-muted-foreground rounded-full animate-bounce [animation-delay:-0.15s]" />
                                <div className="w-2 h-2 bg-muted-foreground rounded-full animate-bounce" />
                            </div>
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

            {/* Pending Changes Section - single merged accept/reject */}
            {hasPendingDiffs && (
                <div className="border-t bg-amber-500/5 shrink-0 overflow-hidden">
                    <div className="px-3 py-2">
                        <div className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground mb-2">
                            Pending Changes
                            {mergedPendingDiffs.length === 1
                                ? ` (${mergedPendingDiffs[0].fileName})`
                                : ` (${mergedPendingDiffs.length} files)`}
                        </div>
                        <div className="space-y-1 max-h-[280px] overflow-y-auto">
                            {mergedPendingDiffs.map((diff) => (
                                <DiffPreview key={diff.fileId} diff={diff} compact={false} />
                            ))}
                        </div>
                    </div>
                    <div className="px-3 py-2 border-t border-amber-500/20 flex items-center gap-2">
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={handleReject}
                            className="flex-1 h-8 text-xs gap-1.5 text-red-600 hover:text-red-700 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/50 border-red-200 dark:border-red-800"
                        >
                            <X size={14} />
                            Reject
                        </Button>
                        <Button
                            size="sm"
                            onClick={handleAccept}
                            disabled={isApproving}
                            className="flex-1 h-8 text-xs gap-1.5 bg-green-600 hover:bg-green-700 text-white"
                        >
                            <Check size={14} />
                            {isApproving ? "Applying…" : "Accept"}
                        </Button>
                    </div>
                </div>
            )}

            {/* Input Area */}
            <div className="p-3 border-t shrink-0 space-y-3">
                <ChatInput />
                {/* Model and read-only controls */}
                <div className="flex items-center gap-3 flex-wrap">
                    <div className="flex items-center gap-2 min-w-0">
                        <label htmlFor="agent-model" className="text-[10px] uppercase tracking-wider font-medium text-muted-foreground shrink-0">
                            Model
                        </label>
                        <select
                            id="agent-model"
                            value={agentModel}
                            onChange={(e) => setAgentModel(e.target.value)}
                            className="h-7 rounded-md border bg-background px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 min-w-0 flex-1 max-w-[140px]"
                        >
                            <option value="gpt-4o">GPT-4o</option>
                            <option value="gpt-4o-mini">GPT-4o mini</option>
                            <option value="gpt-4-turbo">GPT-4 Turbo</option>
                            <option value="gpt-3.5-turbo">GPT-3.5 Turbo</option>
                        </select>
                    </div>
                    <label className="flex items-center gap-2 cursor-pointer shrink-0">
                        <button
                            type="button"
                            role="switch"
                            aria-checked={agentReadOnly}
                            onClick={() => setAgentReadOnly(!agentReadOnly)}
                            className={cn(
                                "relative inline-flex h-5 w-9 shrink-0 rounded-full border border-input transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
                                agentReadOnly ? "bg-primary" : "bg-muted"
                            )}
                        >
                            <span
                                className={cn(
                                    "pointer-events-none block h-4 w-3.5 rounded-full bg-background shadow ring-0 transition-transform mt-0.5 ml-0.5",
                                    agentReadOnly ? "translate-x-4" : "translate-x-0"
                                )}
                            />
                        </button>
                        <span className="text-xs text-muted-foreground">Read only</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer shrink-0" title="Use multi-agent orchestration (Planner, Researcher, Writer, Linter)">
                        <button
                            type="button"
                            role="switch"
                            aria-checked={agentUseOrchestration}
                            onClick={() => setAgentUseOrchestration(!agentUseOrchestration)}
                            className={cn(
                                "relative inline-flex h-5 w-9 shrink-0 rounded-full border border-input transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
                                agentUseOrchestration ? "bg-primary" : "bg-muted"
                            )}
                        >
                            <span
                                className={cn(
                                    "pointer-events-none block h-4 w-3.5 rounded-full bg-background shadow ring-0 transition-transform mt-0.5 ml-0.5",
                                    agentUseOrchestration ? "translate-x-4" : "translate-x-0"
                                )}
                            />
                        </button>
                        <span className="text-xs text-muted-foreground">Multi-agent</span>
                    </label>
                </div>
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
                Open a document to start a conversation about it
            </p>
        </div>
    );
}
