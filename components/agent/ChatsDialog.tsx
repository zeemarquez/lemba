"use client";

import { useStore } from "@/lib/store";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogFooter,
} from "@/components/plate-ui/dialog";
import { MessageSquare, Plus, Trash2 } from "lucide-react";

interface ChatsDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
}

function formatChatTime(timestamp: number): string {
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export function ChatsDialog({ open, onOpenChange }: ChatsDialogProps) {
    const {
        getChatsList,
        createNewChat,
        switchChat,
        clearAllChats,
        activeChatId,
    } = useStore();

    const chats = getChatsList();

    const handleNewChat = () => {
        createNewChat();
        onOpenChange(false);
    };

    const handleSelectChat = (chatId: string) => {
        switchChat(chatId);
        onOpenChange(false);
    };

    const handleClearAll = () => {
        clearAllChats();
        onOpenChange(false);
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-md" showCloseButton>
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <MessageSquare size={20} />
                        Chat history
                    </DialogTitle>
                </DialogHeader>

                <ScrollArea className="max-h-[320px] -mx-1 px-1">
                    <div className="space-y-0.5 py-1">
                        {chats.length === 0 ? (
                            <div className="py-8 text-center text-sm text-muted-foreground">
                                No chats yet. Start a new conversation.
                            </div>
                        ) : (
                            chats.map((chat) => (
                                <button
                                    key={chat.id}
                                    type="button"
                                    onClick={() => handleSelectChat(chat.id)}
                                    className={cn(
                                        "w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left transition-colors",
                                        "hover:bg-accent",
                                        activeChatId === chat.id && "bg-accent"
                                    )}
                                >
                                    <MessageSquare size={16} className="text-muted-foreground shrink-0" />
                                    <div className="flex-1 min-w-0">
                                        <div className="text-sm font-medium truncate">
                                            {chat.title}
                                        </div>
                                        <div className="text-xs text-muted-foreground">
                                            {formatChatTime(chat.updatedAt)} · {chat.messages.length} message{chat.messages.length !== 1 ? 's' : ''}
                                        </div>
                                    </div>
                                </button>
                            ))
                        )}
                    </div>
                </ScrollArea>

                <DialogFooter className="flex-col gap-2 sm:flex-row sm:justify-between border-t pt-4">
                    <div className="flex gap-2 w-full sm:w-auto">
                        <Button
                            variant="default"
                            size="sm"
                            onClick={handleNewChat}
                            className="flex-1 sm:flex-initial gap-2"
                        >
                            <Plus size={16} />
                            New chat
                        </Button>
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={handleClearAll}
                            disabled={chats.length === 0}
                            className="gap-2 text-red-600 hover:text-red-700 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/50"
                        >
                            <Trash2 size={16} />
                            Clear all
                        </Button>
                    </div>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
