"use client";

import { useCallback, useEffect, useState } from "react";
import { BrushCleaning } from "lucide-react";
import { toHex, normalizeHexInput } from "@/lib/color-utils";
import { cn } from "@/lib/utils";

export interface ColorInputProps {
    value: string;
    onChange: (value: string) => void;
    /** Value to restore when reset (BrushCleaning) is clicked */
    defaultValue: string;
    placeholder?: string;
    label?: string;
    size?: "sm" | "md";
    className?: string;
    /** Optional label className (e.g. for ml-1) */
    labelClassName?: string;
    /** When true, render only the color row (no label, no space-y-3) for use in flex layouts */
    inline?: boolean;
}

export function ColorInput({
    value,
    onChange,
    defaultValue,
    placeholder,
    label,
    size = "md",
    className,
    labelClassName,
    inline = false,
}: ColorInputProps) {
    const displayHex = value ? toHex(value) : "";
    const defaultHex = defaultValue ? toHex(defaultValue) : "";
    const [text, setText] = useState(displayHex || defaultHex);
    const [editing, setEditing] = useState(false);

    useEffect(() => {
        if (!editing) setText(displayHex || defaultHex);
    }, [editing, displayHex, defaultHex]);

    const commitHex = useCallback(
        (raw: string) => {
            const hex = normalizeHexInput(raw);
            if (hex !== null) {
                onChange(hex);
                setText(hex);
            } else {
                setText(displayHex || defaultHex);
            }
        },
        [onChange, displayHex, defaultHex]
    );

    const handleTextBlur = () => {
        setEditing(false);
        if (text.trim()) commitHex(text);
        else {
            onChange(defaultValue);
            setText(defaultHex);
        }
    };

    const handleReset = () => {
        onChange(defaultValue);
        setText(defaultHex);
    };

    const sizeClasses = size === "sm" ? "h-10 w-10" : "h-12 w-12";
    const swatchColor = displayHex || defaultHex || "#000000";

    const row = (
        <div className="flex items-center gap-3 p-2 bg-muted/50 border border-border rounded-2xl group transition-all hover:bg-muted">
                <div
                    className={cn(
                        "shrink-0 rounded-xl border-2 border-background shadow-sm overflow-hidden p-0 relative",
                        sizeClasses
                    )}
                    style={{ backgroundColor: swatchColor }}
                >
                    <input
                        type="color"
                        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                        value={swatchColor}
                        onChange={(e) => {
                            const hex = e.target.value;
                            onChange(hex);
                            setText(hex);
                        }}
                    />
                </div>
                <input
                    type="text"
                    className={cn(
                        "flex-1 min-w-0 bg-transparent border-none text-sm font-bold text-foreground outline-none uppercase tracking-wider",
                        size === "sm" && "text-xs"
                    )}
                    value={editing ? text : (displayHex || "")}
                    onChange={(e) => {
                        setText(e.target.value);
                        const v = e.target.value.trim();
                        if (v.startsWith("#") && v.length >= 7) commitHex(v);
                        else if (/^[0-9A-Fa-f]{6}$/.test(v)) commitHex("#" + v);
                    }}
                    onFocus={() => setEditing(true)}
                    onBlur={handleTextBlur}
                    placeholder={placeholder}
                />
                <button
                    type="button"
                    onClick={handleReset}
                    className="shrink-0 p-2 rounded-xl text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                    title="Reset color"
                >
                    <BrushCleaning size={18} />
                </button>
            </div>
    );

    if (inline) {
        return <div className={cn(className)}>{row}</div>;
    }

    return (
        <div className={cn("space-y-3", className)}>
            {label && (
                <label
                    className={cn(
                        "text-[11px] font-bold uppercase tracking-[0.15em] text-muted-foreground",
                        labelClassName ?? "ml-1"
                    )}
                >
                    {label}
                </label>
            )}
            {row}
        </div>
    );
}
