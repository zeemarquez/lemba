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
import { useState, useEffect } from "react";

interface InputDialogProps {
    isOpen: boolean;
    onOpenChange: (open: boolean) => void;
    title: string;
    description: string;
    placeholder: string;
    defaultValue?: string;
    onConfirm: (value: string) => Promise<void>;
    confirmLabel?: string;
}

export function InputDialog({
    isOpen,
    onOpenChange,
    title,
    description,
    placeholder,
    defaultValue = "",
    onConfirm,
    confirmLabel = "Confirm"
}: InputDialogProps) {
    const [value, setValue] = useState(defaultValue);
    const [isSubmitting, setIsSubmitting] = useState(false);

    useEffect(() => {
        if (isOpen) {
            setValue(defaultValue);
            setIsSubmitting(false);
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

    return (
        <Dialog open={isOpen} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-[425px]">
                <DialogHeader>
                    <DialogTitle>{title}</DialogTitle>
                    <DialogDescription>
                        {description}
                    </DialogDescription>
                </DialogHeader>
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
            </DialogContent>
        </Dialog>
    );
}
