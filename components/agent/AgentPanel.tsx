"use client";

import { useState, useMemo, useEffect } from "react";
import { useStore } from "@/lib/store";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { History, MessageSquarePlus, Bot, Check, X, ChevronDown, MessageCircleQuestion, Pencil } from "lucide-react";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { modelToProvider, hasEnvApiKey } from "@/lib/agent";
import type { LLMProvider } from "@/lib/agent";
import { ChatInput } from "./ChatInput";
import { ChatMessage } from "./ChatMessage";
import { DiffPreview } from "./DiffPreview";
import { ChatsDialog } from "./ChatsDialog";

const PROVIDER_MODELS: Record<LLMProvider, { value: string; label: string }[]> = {
    openai: [
        { value: 'gpt-4o', label: 'GPT-4o' },
        { value: 'gpt-4o-mini', label: 'GPT-4o mini' },
        { value: 'gpt-4-turbo', label: 'GPT-4 Turbo' },
        { value: 'gpt-3.5-turbo', label: 'GPT-3.5 Turbo' },
    ],
    anthropic: [
        { value: 'claude-sonnet-4-20250514', label: 'Claude Sonnet 4' },
        { value: 'claude-3-5-sonnet-20241022', label: 'Claude 3.5 Sonnet' },
        { value: 'claude-3-opus-20240229', label: 'Claude 3 Opus' },
        { value: 'claude-3-haiku-20240307', label: 'Claude 3 Haiku' },
    ],
    google: [
        { value: 'gemini-1.5-flash', label: 'Gemini 1.5 Flash' },
        { value: 'gemini-1.5-pro', label: 'Gemini 1.5 Pro' },
        { value: 'gemini-2.0-flash', label: 'Gemini 2.0 Flash' },
    ],
};

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
        agentApiKeys,
        agentProviderKeysValid,
        agentModel,
        agentReadOnly,
        agentUseOrchestration,
        setAgentModel,
        setAgentProvider,
        setAgentReadOnly,
        setAgentUseOrchestration,
        createNewChat,
    } = useStore();

    const currentModels = useMemo(() => {
        const list: { value: string; label: string; provider: LLMProvider }[] = [];
        (['openai', 'anthropic', 'google'] as LLMProvider[]).forEach((provider) => {
            const hasStoredKey = (agentApiKeys?.[provider] ?? '').trim().length > 0;
            const validStored = agentProviderKeysValid?.[provider];
            const hasEnv = hasEnvApiKey(provider);
            const includeProvider = (hasStoredKey && validStored) || hasEnv;
            if (includeProvider) {
                (PROVIDER_MODELS[provider] ?? []).forEach((m) => list.push({ ...m, provider }));
            }
        });
        return list;
    }, [agentApiKeys, agentProviderKeysValid]);

    const currentModelLabel = useMemo(() => {
        const found = currentModels.find((m) => m.value === agentModel);
        return found?.label ?? agentModel;
    }, [currentModels, agentModel]);

    useEffect(() => {
        if (currentModels.length === 0) return;
        const isCurrentInList = currentModels.some((m) => m.value === agentModel);
        if (!isCurrentInList) {
            setAgentModel(currentModels[0].value);
            setAgentProvider(currentModels[0].provider);
        }
    }, [currentModels, agentModel, setAgentModel, setAgentProvider]);

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
                <span className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground">
                    AI Assistant
                </span>
                <div className="flex items-center gap-0.5">
                    <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6"
                        onClick={() => setChatsDialogOpen(true)}
                        title="Chat history"
                    >
                        <History size={14} />
                    </Button>
                    <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6"
                        onClick={() => createNewChat()}
                        title="New chat"
                    >
                        <MessageSquarePlus size={14} />
                    </Button>
                </div>
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
                {/* Model and mode (Ask / Quick edit / Agent) */}
                <div className="flex items-center gap-3 flex-wrap">
                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <Button
                                variant="outline"
                                size="sm"
                                className="h-7 rounded-md border border-input bg-muted/50 px-2.5 text-[10px] font-medium min-w-0 max-w-[140px] gap-1 hover:bg-muted focus-visible:ring-ring focus-visible:ring-offset-2"
                                disabled={currentModels.length === 0}
                                title={currentModels.length === 0 ? 'Add and validate API keys in Settings → Agent' : undefined}
                            >
                                <span className="truncate">
                                    {currentModels.length === 0
                                        ? 'No provider'
                                        : currentModelLabel}
                                </span>
                                <ChevronDown size={12} className="shrink-0 opacity-60" />
                            </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="start" className="min-w-[140px]">
                            {currentModels.map((m) => (
                                <DropdownMenuItem
                                    key={m.value}
                                    className="text-[10px] py-1.5"
                                    onClick={() => {
                                        setAgentModel(m.value);
                                        setAgentProvider(m.provider);
                                    }}
                                >
                                    {m.label}
                                </DropdownMenuItem>
                            ))}
                        </DropdownMenuContent>
                    </DropdownMenu>
                    <div
                        role="group"
                        aria-label="Agent mode"
                        className="inline-flex rounded-md border border-input bg-muted/50 p-0.5"
                    >
                        <button
                            type="button"
                            onClick={() => {
                                setAgentReadOnly(true);
                                setAgentUseOrchestration(false);
                            }}
                            className={cn(
                                "inline-flex items-center gap-1 px-2.5 py-1 text-[10px] font-medium rounded transition-colors",
                                agentReadOnly && !agentUseOrchestration
                                    ? "bg-background text-foreground shadow-sm"
                                    : "text-muted-foreground hover:text-foreground"
                            )}
                        >
                            <MessageCircleQuestion size={12} className="shrink-0" />
                            Ask
                        </button>
                        <button
                            type="button"
                            onClick={() => {
                                setAgentReadOnly(false);
                                setAgentUseOrchestration(false);
                            }}
                            className={cn(
                                "inline-flex items-center gap-1 px-2.5 py-1 text-[10px] font-medium rounded transition-colors",
                                !agentReadOnly && !agentUseOrchestration
                                    ? "bg-background text-foreground shadow-sm"
                                    : "text-muted-foreground hover:text-foreground"
                            )}
                        >
                            <Pencil size={12} className="shrink-0" />
                            Quick edit
                        </button>
                        <button
                            type="button"
                            onClick={() => {
                                setAgentReadOnly(false);
                                setAgentUseOrchestration(true);
                            }}
                            title="Multi-agent (Planner, Researcher, Writer, Linter)"
                            className={cn(
                                "inline-flex items-center gap-1 px-2.5 py-1 text-[10px] font-medium rounded transition-colors",
                                agentUseOrchestration
                                    ? "bg-background text-foreground shadow-sm"
                                    : "text-muted-foreground hover:text-foreground"
                            )}
                        >
                            <Bot size={12} className="shrink-0" />
                            Agent
                        </button>
                    </div>
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
            Press <kbd className="rounded bg-muted px-1 py-0.5 font-mono">Enter</kbd> to send,{" "}<kbd className="ml-1 rounded bg-muted px-1 py-0.5 font-mono">Shift+Enter</kbd> for new line
            </p>
        </div>
    );
}
