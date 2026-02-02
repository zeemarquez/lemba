"use client";

import { useState, useRef, useEffect, useCallback, KeyboardEvent } from "react";
import { useStore } from "@/lib/store";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Send, Plus, FileText, Link as LinkIcon, X, ImageIcon } from "lucide-react";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
    Dialog,
    DialogContent,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/plate-ui/dialog";
import { Input } from "@/components/plate-ui/input";
import { RagDocument, generateSyncId } from "@/lib/types";

const CHIP_DATA_ATTR = "data-doc-id";
const CHIP_CLASS = "chat-input-chip";

function formatUrlForDisplay(url: string): string {
    return url
        .replace(/^https?:\/\//i, "")
        .replace(/^www\./i, "")
        .trim();
}

/** True if pasted text looks like a single URL (e.g. pasted from address bar). */
function isPastedUrl(text: string): boolean {
    const trimmed = text.trim();
    if (!trimmed || /\s/.test(trimmed)) return false;
    return /^https?:\/\/\S+$/i.test(trimmed);
}

function getChipLabel(doc: RagDocument): string {
    if (doc.type === "url" && (doc.url ?? doc.name)) {
        const raw = doc.url ?? doc.name;
        const display = formatUrlForDisplay(raw);
        return display.length > 24 ? display.slice(0, 21) + "…" : display;
    }
    if (doc.type === "image") {
        return doc.name.length > 20 ? doc.name.slice(0, 17) + "…" : doc.name;
    }
    return doc.name.length > 20 ? doc.name.slice(0, 17) + "…" : doc.name;
}

function getTextAndDocIdsFromEditable(editable: HTMLElement): { text: string; docIds: string[] } {
    let text = "";
    const docIds: string[] = [];
    const walk = (node: Node) => {
        if (node.nodeType === Node.TEXT_NODE) {
            text += node.textContent ?? "";
        } else if (node.nodeType === Node.ELEMENT_NODE) {
            const el = node as HTMLElement;
            if (el.getAttribute?.(CHIP_DATA_ATTR)) {
                const id = el.getAttribute(CHIP_DATA_ATTR);
                if (id) docIds.push(id);
            } else {
                node.childNodes.forEach(walk);
            }
        }
    };
    editable.childNodes.forEach(walk);
    return { text: text.trim(), docIds };
}

function insertChipAtRange(editable: HTMLElement, doc: RagDocument, range: Range | null) {
    const chip = document.createElement("span");
    chip.setAttribute(CHIP_DATA_ATTR, doc.id);
    chip.setAttribute("contenteditable", "false");
    chip.className = CHIP_CLASS;
    chip.contentEditable = "false";
    const label = document.createElement("span");
    label.className = "chip-label";
    label.textContent = getChipLabel(doc);
    const removeBtn = document.createElement("button");
    removeBtn.type = "button";
    removeBtn.className = "chip-remove";
    removeBtn.setAttribute("aria-label", "Remove");
    removeBtn.innerHTML = "<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"10\" height=\"10\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><line x1=\"18\" y1=\"6\" x2=\"6\" y2=\"18\"></line><line x1=\"6\" y1=\"6\" x2=\"18\" y2=\"18\"></line></svg>";
    chip.appendChild(label);
    chip.appendChild(removeBtn);

    if (range && range.commonAncestorContainer && editable.contains(range.commonAncestorContainer)) {
        try {
            range.collapse(true);
            range.insertNode(chip);
            range.setStartAfter(chip);
            range.setEndAfter(chip);
            const sel = window.getSelection();
            if (sel) {
                sel.removeAllRanges();
                sel.addRange(range);
            }
            const space = document.createTextNode("\u00A0");
            chip.parentNode?.insertBefore(space, chip.nextSibling);
            range.setStartAfter(space);
            range.setEndAfter(space);
            if (sel) {
                sel.removeAllRanges();
                sel.addRange(range);
            }
        } catch {
            editable.appendChild(document.createTextNode("\u00A0"));
            editable.appendChild(chip);
            editable.appendChild(document.createTextNode("\u00A0"));
        }
    } else {
        if (editable.childNodes.length) {
            editable.appendChild(document.createTextNode("\u00A0"));
            editable.appendChild(chip);
            editable.appendChild(document.createTextNode("\u00A0"));
        } else {
            editable.appendChild(chip);
            editable.appendChild(document.createTextNode("\u00A0"));
        }
    }
}

export function ChatInput() {
    const {
        sendAgentMessage,
        agentLoading,
        activeFileId,
        currentView,
        addRagDocument,
        removeRagDocument,
        activeChatId,
    } = useStore();

    const editableRef = useRef<HTMLDivElement>(null);
    const lastRangeRef = useRef<Range | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const imageInputRef = useRef<HTMLInputElement>(null);
    const [contentVersion, setContentVersion] = useState(0);
    const [linkDialogOpen, setLinkDialogOpen] = useState(false);
    const [linkUrl, setLinkUrl] = useState("");

    const hasFile = currentView === "file" && !!activeFileId;

    const saveSelection = useCallback(() => {
        const sel = window.getSelection();
        const editable = editableRef.current;
        if (!sel || sel.rangeCount === 0 || !editable) return;
        const range = sel.getRangeAt(0);
        if (editable.contains(range.commonAncestorContainer)) {
            lastRangeRef.current = range.cloneRange();
        }
    }, []);

    useEffect(() => {
        const editable = editableRef.current;
        if (!editable) return;
        const onSelectionChange = () => {
            const sel = window.getSelection();
            if (sel && editable.contains(sel.anchorNode)) {
                try {
                    lastRangeRef.current = sel.rangeCount ? sel.getRangeAt(0).cloneRange() : null;
                } catch {
                    lastRangeRef.current = null;
                }
            }
        };
        document.addEventListener("selectionchange", onSelectionChange);
        return () => document.removeEventListener("selectionchange", onSelectionChange);
    }, []);

    useEffect(() => {
        const editable = editableRef.current;
        if (!editable) return;
        const onClick = (e: MouseEvent) => {
            const target = e.target as HTMLElement;
            if (target.closest?.(".chip-remove")) {
                e.preventDefault();
                const chip = target.closest(`[${CHIP_DATA_ATTR}]`) as HTMLElement;
                if (chip) {
                    const id = chip.getAttribute(CHIP_DATA_ATTR);
                    if (id) {
                        removeRagDocument(id);
                        chip.remove();
                        const prev = chip.previousSibling;
                        if (prev?.nodeType === Node.TEXT_NODE && prev.textContent === "\u00A0") prev.remove();
                        const next = chip.nextSibling;
                        if (next?.nodeType === Node.TEXT_NODE && next.textContent === "\u00A0") next.remove();
                        setContentVersion((v) => v + 1);
                    }
                }
            }
        };
        editable.addEventListener("click", onClick);
        return () => editable.removeEventListener("click", onClick);
    }, [removeRagDocument]);

    const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file || !activeChatId) return;

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

        if (editableRef.current) {
            saveSelection();
            insertChipAtRange(editableRef.current, doc, lastRangeRef.current);
            setContentVersion((v) => v + 1);
        }
        await addRagDocument(doc);
        if (fileInputRef.current) fileInputRef.current.value = '';
    };

    const addImageFromFile = (file: File): Promise<string> => {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => {
                const dataUrl = reader.result as string;
                resolve(dataUrl);
            };
            reader.onerror = () => reject(reader.error);
            reader.readAsDataURL(file);
        });
    };

    const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file || !file.type.startsWith("image/") || !activeChatId) return;
        try {
            const content = await addImageFromFile(file);
            const doc: RagDocument = {
                id: crypto.randomUUID(),
                chatId: activeChatId,
                name: file.name,
                type: "image",
                content,
                createdAt: Date.now(),
                syncId: generateSyncId(),
                updatedAt: Date.now(),
                isDeleted: false,
                userId: null,
            };
            if (editableRef.current) {
                saveSelection();
                insertChipAtRange(editableRef.current, doc, lastRangeRef.current);
                setContentVersion((v) => v + 1);
            }
            await addRagDocument(doc);
        } catch (err) {
            console.error("Failed to add image:", err);
        }
        if (imageInputRef.current) imageInputRef.current.value = "";
    };

    const addLinkFromUrl = async (url: string) => {
        const trimmed = url.trim();
        if (!trimmed || !activeChatId) return;

        let content = '';
        try {
            if (typeof window !== 'undefined' && (window as unknown as { electronAPI?: { fetchUrl: (u: string) => Promise<{ error?: string; content?: string }> } }).electronAPI?.fetchUrl) {
                const result = await (window as unknown as { electronAPI: { fetchUrl: (u: string) => Promise<{ error?: string; content?: string }> } }).electronAPI.fetchUrl(trimmed);
                if (!result.error) content = result.content || '';
            } else {
                const baseUrl = typeof window !== 'undefined' && window.location.origin && !window.location.origin.startsWith('file') ? window.location.origin : '';
                const response = await fetch(`${baseUrl}/api/fetch-url?url=${encodeURIComponent(trimmed)}`);
                if (response.ok) {
                    const data = await response.json();
                    content = data.content || '';
                }
            }
        } catch (error) {
            console.error('Failed to fetch URL content:', error);
        }

        const doc: RagDocument = {
            id: crypto.randomUUID(),
            chatId: activeChatId,
            name: trimmed,
            type: 'url',
            url: trimmed,
            content,
            createdAt: Date.now(),
            syncId: generateSyncId(),
            updatedAt: Date.now(),
            isDeleted: false,
            userId: null
        };

        if (editableRef.current) {
            saveSelection();
            insertChipAtRange(editableRef.current, doc, lastRangeRef.current);
            setContentVersion((v) => v + 1);
        }
        addRagDocument(doc);
    };

    const handleAddLinkClick = () => {
        setLinkDialogOpen(true);
    };

    const handleLinkDialogSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        await addLinkFromUrl(linkUrl);
        setLinkDialogOpen(false);
        setLinkUrl("");
    };

    const handleKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
        if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            handleSubmit();
        }
    };

    const handlePaste = async (e: React.ClipboardEvent) => {
        const files = e.clipboardData.files;
        if (files?.length && files[0].type.startsWith("image/") && activeChatId) {
            e.preventDefault();
            try {
                const content = await addImageFromFile(files[0]);
                const doc: RagDocument = {
                    id: crypto.randomUUID(),
                    chatId: activeChatId,
                    name: files[0].name || "image.png",
                    type: "image",
                    content,
                    createdAt: Date.now(),
                    syncId: generateSyncId(),
                    updatedAt: Date.now(),
                    isDeleted: false,
                    userId: null,
                };
                if (editableRef.current) {
                    saveSelection();
                    insertChipAtRange(editableRef.current, doc, lastRangeRef.current);
                    setContentVersion((v) => v + 1);
                }
                await addRagDocument(doc);
            } catch (err) {
                console.error("Failed to add pasted image:", err);
            }
            return;
        }
        const text = e.clipboardData.getData("text/plain");
        if (isPastedUrl(text)) {
            e.preventDefault();
            const url = text.trim();
            addLinkFromUrl(url);
            return;
        }
        e.preventDefault();
        document.execCommand("insertText", false, text);
    };

    const handleSubmit = () => {
        const editable = editableRef.current;
        if (!editable || agentLoading) return;
        const { text, docIds } = getTextAndDocIdsFromEditable(editable);
        const hasAttachments = docIds.length > 0;
        if (!text && !hasAttachments) return;

        sendAgentMessage(text ?? "");
        editable.innerHTML = "";
        setContentVersion((v) => v + 1);
        editable.focus();
    };

    const hasContent = (() => {
        const el = editableRef.current;
        if (!el) return false;
        const { text, docIds } = getTextAndDocIdsFromEditable(el);
        return text.length > 0 || docIds.length > 0;
    })();

    return (
        <div className="space-y-2">
            <div
                className={cn(
                    "relative flex items-center rounded-md border overflow-hidden",
                    "focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2",
                    !hasFile && "opacity-80",
                    hasFile
                        ? "bg-background border-input"
                        : "bg-muted/50 border-muted-foreground/20"
                )}
            >
                <input
                    type="file"
                    ref={fileInputRef}
                    className="hidden"
                    accept=".md,.txt,.json,.js,.ts,.tsx,text/*"
                    onChange={handleFileUpload}
                />
                <input
                    type="file"
                    ref={imageInputRef}
                    className="hidden"
                    accept="image/*"
                    onChange={handleImageUpload}
                />

                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <button
                            type="button"
                            disabled={agentLoading}
                            className="shrink-0 flex items-center justify-center h-[38px] w-10 text-muted-foreground hover:text-foreground disabled:opacity-50 disabled:pointer-events-none"
                        >
                            <Plus size={18} />
                        </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="start">
                        <DropdownMenuItem onClick={() => fileInputRef.current?.click()}>
                            <FileText className="mr-2 h-4 w-4" />
                            <span>Upload Document</span>
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => imageInputRef.current?.click()}>
                            <ImageIcon className="mr-2 h-4 w-4" />
                            <span>Upload Image</span>
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={handleAddLinkClick}>
                            <LinkIcon className="mr-2 h-4 w-4" />
                            <span>Add Link</span>
                        </DropdownMenuItem>
                    </DropdownMenuContent>
                </DropdownMenu>

                <div
                    ref={editableRef}
                    contentEditable
                    suppressContentEditableWarning
                    data-placeholder={
                        hasFile
                            ? "Ask about the document..."
                            : "Select a file or add a link/document"
                    }
                    onKeyDown={handleKeyDown}
                    onPaste={handlePaste}
                    onInput={() => setContentVersion((v) => v + 1)}
                    className={cn(
                        "flex-1 min-w-0 min-h-[38px] max-h-[150px] overflow-y-auto pl-1 pr-2 py-2",
                        "text-sm placeholder:text-muted-foreground",
                        "focus:outline-none focus:ring-0 empty:before:content-[attr(data-placeholder)] empty:before:text-muted-foreground",
                        "disabled:pointer-events-none disabled:opacity-70"
                    )}
                    style={{ outline: "none" }}
                />

                <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    onClick={handleSubmit}
                    disabled={!hasContent || agentLoading}
                    className="shrink-0 h-8 w-8 mr-1 text-muted-foreground hover:text-foreground"
                >
                    <Send size={16} />
                </Button>
            </div>

            <Dialog open={linkDialogOpen} onOpenChange={(open) => {
                setLinkDialogOpen(open);
                if (!open) setLinkUrl("");
            }}>
                <DialogContent showCloseButton>
                    <DialogHeader>
                        <DialogTitle>Add Link</DialogTitle>
                    </DialogHeader>
                    <form onSubmit={handleLinkDialogSubmit}>
                        <Input
                            type="url"
                            placeholder="https://example.com"
                            value={linkUrl}
                            onChange={(e) => setLinkUrl(e.target.value)}
                            className="w-full"
                            autoFocus
                        />
                        <DialogFooter className="mt-4">
                            <Button
                                type="button"
                                variant="outline"
                                onClick={() => setLinkDialogOpen(false)}
                            >
                                Cancel
                            </Button>
                            <Button type="submit" disabled={!linkUrl.trim()}>
                                Add
                            </Button>
                        </DialogFooter>
                    </form>
                </DialogContent>
            </Dialog>

            <style>{`
                [data-placeholder]:empty::before {
                    content: attr(data-placeholder);
                    color: var(--muted-foreground);
                }
                .${CHIP_CLASS} {
                    display: inline-flex !important;
                    align-items: center;
                    gap: 4px;
                    background: var(--secondary) !important;
                    color: var(--secondary-foreground) !important;
                    border-radius: 6px;
                    padding: 2px 8px;
                    margin: 0 2px;
                    font-size: 11px;
                    vertical-align: middle;
                    white-space: nowrap;
                    max-width: 180px;
                    border: 1px solid var(--border);
                    font-weight: 500;
                }
                .${CHIP_CLASS} .chip-label {
                    overflow: hidden;
                    text-overflow: ellipsis;
                }
                .${CHIP_CLASS} .chip-remove {
                    display: inline-flex;
                    align-items: center;
                    justify-content: center;
                    padding: 0;
                    margin-left: 2px;
                    background: none;
                    border: none;
                    cursor: pointer;
                    color: inherit;
                    opacity: 0.7;
                    border-radius: 2px;
                }
                .${CHIP_CLASS} .chip-remove:hover {
                    opacity: 1;
                }
            `}</style>
        </div>
    );
}
