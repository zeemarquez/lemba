"use client";

import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/plate-ui/dialog";
import { Button } from "@/components/plate-ui/button";
import { Input } from "@/components/plate-ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useState, useEffect, useRef } from "react";
import { Upload } from "lucide-react";

interface InputDialogProps {
    isOpen: boolean;
    onOpenChange: (open: boolean) => void;
    title: string;
    description: string;
    placeholder: string;
    defaultValue?: string;
    onConfirm: (value: string) => Promise<void>;
    confirmLabel?: string;
    /** If provided, enables the Upload tab with file picker filtered by this extension (e.g., ".md" or ".mdt") */
    uploadAccept?: string;
    /** Called when a file is uploaded. Receives the file name and content. */
    onUpload?: (fileName: string, content: string) => Promise<void>;
}

export function InputDialog({
    isOpen,
    onOpenChange,
    title,
    description,
    placeholder,
    defaultValue = "",
    onConfirm,
    confirmLabel = "Confirm",
    uploadAccept,
    onUpload
}: InputDialogProps) {
    const [value, setValue] = useState(defaultValue);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [activeTab, setActiveTab] = useState<"create" | "upload">("create");
    const [selectedFile, setSelectedFile] = useState<File | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const showUploadTab = !!uploadAccept && !!onUpload;

    useEffect(() => {
        if (isOpen) {
            setValue(defaultValue);
            setIsSubmitting(false);
            setActiveTab("create");
            setSelectedFile(null);
        }
    }, [isOpen, defaultValue]);

    const handleSubmit = async (e?: React.FormEvent) => {
        e?.preventDefault();
        if (!value.trim()) return;

        setIsSubmitting(true);
        try {
            await onConfirm(value.trim());
            onOpenChange(false);
        } catch (error) {
            console.error(error);
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            setSelectedFile(file);
        }
    };

    const handleUploadSubmit = async () => {
        if (!selectedFile || !onUpload) return;

        setIsSubmitting(true);
        try {
            const content = await selectedFile.text();
            await onUpload(selectedFile.name, content);
            onOpenChange(false);
        } catch (error) {
            console.error(error);
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleBrowseClick = () => {
        fileInputRef.current?.click();
    };

    return (
        <Dialog open={isOpen} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-[425px]">
                <DialogHeader>
                    <DialogTitle>{title}</DialogTitle>
                    <DialogDescription>
                        {description}
                    </DialogDescription>
                </DialogHeader>

                {showUploadTab ? (
                    <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as "create" | "upload")} className="w-full">
                        <TabsList className="grid w-full grid-cols-2">
                            <TabsTrigger value="create">Create New</TabsTrigger>
                            <TabsTrigger value="upload">Upload</TabsTrigger>
                        </TabsList>
                        
                        <TabsContent value="create">
                            <form onSubmit={handleSubmit}>
                                <div className="grid gap-4 py-4">
                                    <Input
                                        id="name"
                                        value={value}
                                        onChange={(e) => setValue(e.target.value)}
                                        placeholder={placeholder}
                                        autoFocus
                                        disabled={isSubmitting}
                                    />
                                </div>
                                <DialogFooter>
                                    <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isSubmitting}>
                                        Cancel
                                    </Button>
                                    <Button type="submit" disabled={!value.trim() || isSubmitting}>
                                        {isSubmitting ? "Processing..." : confirmLabel}
                                    </Button>
                                </DialogFooter>
                            </form>
                        </TabsContent>

                        <TabsContent value="upload">
                            <div className="grid gap-4 py-4">
                                <input
                                    type="file"
                                    ref={fileInputRef}
                                    accept={uploadAccept}
                                    onChange={handleFileSelect}
                                    className="hidden"
                                />
                                <div 
                                    className="border-2 border-dashed border-muted-foreground/25 rounded-lg p-6 text-center hover:border-muted-foreground/50 transition-colors cursor-pointer"
                                    onClick={handleBrowseClick}
                                >
                                    <Upload className="mx-auto h-8 w-8 text-muted-foreground mb-2" />
                                    {selectedFile ? (
                                        <p className="text-sm text-foreground font-medium">{selectedFile.name}</p>
                                    ) : (
                                        <>
                                            <p className="text-sm text-muted-foreground">
                                                Click to select a file
                                            </p>
                                            <p className="text-xs text-muted-foreground/70 mt-1">
                                                Accepts {uploadAccept} files
                                            </p>
                                        </>
                                    )}
                                </div>
                            </div>
                            <DialogFooter>
                                <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isSubmitting}>
                                    Cancel
                                </Button>
                                <Button type="button" onClick={handleUploadSubmit} disabled={!selectedFile || isSubmitting}>
                                    {isSubmitting ? "Uploading..." : "Upload"}
                                </Button>
                            </DialogFooter>
                        </TabsContent>
                    </Tabs>
                ) : (
                    <form onSubmit={handleSubmit}>
                        <div className="grid gap-4 py-4">
                            <Input
                                id="name"
                                value={value}
                                onChange={(e) => setValue(e.target.value)}
                                placeholder={placeholder}
                                autoFocus
                                disabled={isSubmitting}
                            />
                        </div>
                        <DialogFooter>
                            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isSubmitting}>
                                Cancel
                            </Button>
                            <Button type="submit" disabled={!value.trim() || isSubmitting}>
                                {isSubmitting ? "Processing..." : confirmLabel}
                            </Button>
                        </DialogFooter>
                    </form>
                )}
            </DialogContent>
        </Dialog>
    );
}
