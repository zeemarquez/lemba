"use client";

import { AgentMessage } from "@/lib/agent";
import { cn } from "@/lib/utils";
import { Bot, User, FileText } from "lucide-react";

interface ChatMessageProps {
    message: AgentMessage;
}

export function ChatMessage({ message }: ChatMessageProps) {
    const isUser = message.role === 'user';
    const isAssistant = message.role === 'assistant';

    return (
        <div
            className={cn(
                "flex gap-3",
                isUser && "flex-row-reverse"
            )}
        >
            {/* Avatar */}
            <div
                className={cn(
                    "w-7 h-7 rounded-full flex items-center justify-center shrink-0",
                    isUser ? "bg-primary text-primary-foreground" : "bg-muted"
                )}
            >
                {isUser ? (
                    <User size={14} />
                ) : (
                    <Bot size={14} />
                )}
            </div>

            {/* Message Content */}
            <div
                className={cn(
                    "flex-1 min-w-0",
                    isUser && "text-right"
                )}
            >
                {/* Mentioned Files */}
                {message.mentions && message.mentions.length > 0 && (
                    <div className={cn(
                        "flex flex-wrap gap-1 mb-1",
                        isUser && "justify-end"
                    )}>
                        {message.mentions.map((mention) => (
                            <span
                                key={mention.fileId}
                                className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] bg-primary/10 text-primary"
                            >
                                <FileText size={10} />
                                {mention.fileName}
                            </span>
                        ))}
                    </div>
                )}

                {/* Message Bubble */}
                <div
                    className={cn(
                        "inline-block rounded-lg px-3 py-2 text-sm max-w-full",
                        isUser 
                            ? "bg-primary text-primary-foreground" 
                            : "bg-muted"
                    )}
                >
                    <MessageContent content={message.content} />
                </div>

                {/* Timestamp */}
                <div className="text-[10px] text-muted-foreground mt-1">
                    {formatTime(message.timestamp)}
                </div>
            </div>
        </div>
    );
}

function MessageContent({ content }: { content: string }) {
    // Simple markdown-like rendering for code blocks and inline code
    const parts = content.split(/(```[\s\S]*?```|`[^`]+`)/);
    
    return (
        <div className="whitespace-pre-wrap break-words">
            {parts.map((part, index) => {
                // Code block
                if (part.startsWith('```') && part.endsWith('```')) {
                    const code = part.slice(3, -3).replace(/^\w+\n/, ''); // Remove language hint
                    return (
                        <pre
                            key={index}
                            className="my-2 p-2 rounded bg-background/50 text-xs overflow-x-auto"
                        >
                            <code>{code}</code>
                        </pre>
                    );
                }
                
                // Inline code
                if (part.startsWith('`') && part.endsWith('`')) {
                    return (
                        <code
                            key={index}
                            className="px-1 py-0.5 rounded bg-background/50 text-xs"
                        >
                            {part.slice(1, -1)}
                        </code>
                    );
                }
                
                // Regular text
                return <span key={index}>{part}</span>;
            })}
        </div>
    );
}

function formatTime(timestamp: number): string {
    const date = new Date(timestamp);
    const now = new Date();
    
    // If same day, show time only
    if (date.toDateString() === now.toDateString()) {
        return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }
    
    // Otherwise show date and time
    return date.toLocaleDateString([], { 
        month: 'short', 
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
}
