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

/** Render inline bold and return React nodes */
function renderWithBold(text: string, keyPrefix: string): React.ReactNode[] {
    const nodes: React.ReactNode[] = [];
    let i = 0;
    const re = /\*\*([^*]+)\*\*/g;
    let lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = re.exec(text)) !== null) {
        if (match.index > lastIndex) {
            nodes.push(text.slice(lastIndex, match.index));
        }
        nodes.push(<strong key={`${keyPrefix}-${i++}`}>{match[1]}</strong>);
        lastIndex = match.index + match[0].length;
    }
    if (lastIndex < text.length) {
        nodes.push(text.slice(lastIndex));
    }
    return nodes.length > 0 ? nodes : [text];
}

function MessageContent({ content }: { content: string }) {
    // Simple markdown-like rendering: code blocks, inline code, bullet lists, bold
    const parts = content.split(/(```[\s\S]*?```|`[^`]+`)/);

    return (
        <div className="whitespace-pre-wrap break-words">
            {parts.map((part, partIndex) => {
                // Code block
                if (part.startsWith('```') && part.endsWith('```')) {
                    const code = part.slice(3, -3).replace(/^\w+\n/, ''); // Remove language hint
                    return (
                        <pre
                            key={partIndex}
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
                            key={partIndex}
                            className="px-1 py-0.5 rounded bg-background/50 text-xs"
                        >
                            {part.slice(1, -1)}
                        </code>
                    );
                }

                // Regular text: support bullet lines and **bold**
                const lines = part.split('\n');
                const elements: React.ReactNode[] = [];
                let listItems: string[] = [];

                const flushList = (key: string) => {
                    if (listItems.length > 0) {
                        elements.push(
                            <ul key={key} className="list-disc list-inside my-1 space-y-0.5">
                                {listItems.map((line, i) => (
                                    <li key={`${key}-${i}`}>
                                        {renderWithBold(line.replace(/^[-*]\s+/, ''), `${key}-${i}`)}
                                    </li>
                                ))}
                            </ul>
                        );
                        listItems = [];
                    }
                };

                lines.forEach((line, lineIndex) => {
                    const key = `p-${partIndex}-${lineIndex}`;
                    if (/^[-*]\s+/.test(line)) {
                        listItems.push(line);
                    } else {
                        flushList(`${key}-ul`);
                        if (line.trim()) {
                            elements.push(
                                <span key={key}>
                                    {renderWithBold(line, key)}
                                    {lineIndex < lines.length - 1 ? '\n' : null}
                                </span>
                            );
                        } else if (lineIndex < lines.length - 1) {
                            elements.push(<br key={key} />);
                        }
                    }
                });
                flushList(`${partIndex}-ul-end`);

                return <span key={partIndex}>{elements}</span>;
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
