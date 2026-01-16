'use client';

import type { DropdownMenuProps } from '@radix-ui/react-dropdown-menu';
import { FontFamilyPlugin } from '@platejs/basic-styles/react';
import { TypeIcon } from 'lucide-react';
import { KEYS } from 'platejs';
import { useEditorPlugin, useEditorSelector } from 'platejs/react';
import * as React from 'react';

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/plate-ui/dropdown-menu';
import { cn } from '@/lib/utils';

import { ToolbarButton } from './toolbar';

const FONT_FAMILIES = [
  { label: 'Inter', value: "'Inter', sans-serif" },
  { label: 'Times New Roman', value: "'Times New Roman', serif" },
  { label: 'Georgia', value: "'Georgia', serif" },
  { label: 'Outfit', value: "'Outfit', sans-serif" },
  { label: 'JetBrains Mono', value: "'JetBrains Mono', monospace" },
  { label: 'System', value: 'system-ui, sans-serif' },
] as const;

export function HeaderFooterFontFamilyButton(props: DropdownMenuProps) {
  const { tf } = useEditorPlugin(FontFamilyPlugin);
  const [open, setOpen] = React.useState(false);

  const currentFontFamily = useEditorSelector((editor) => {
    const fontFamily = editor.api.marks()?.[KEYS.fontFamily];
    return fontFamily as string | undefined;
  }, []);

  const currentLabel = FONT_FAMILIES.find(f => f.value === currentFontFamily)?.label || 'Font';

  return (
    <DropdownMenu modal={false} onOpenChange={setOpen} open={open} {...props}>
      <DropdownMenuTrigger asChild>
        <ToolbarButton isDropdown pressed={open} tooltip="Font Family" className="min-w-[80px]">
          <TypeIcon className="size-4 mr-1" />
          <span className="text-xs truncate max-w-[60px]">{currentLabel}</span>
        </ToolbarButton>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="start" className="min-w-[160px]">
        {FONT_FAMILIES.map(({ label, value }) => (
          <DropdownMenuItem
            key={value}
            className={cn(
              'flex items-center gap-2',
              currentFontFamily === value && 'bg-accent'
            )}
            style={{ fontFamily: value }}
            onSelect={() => {
              tf.fontFamily.addMark(value);
              setOpen(false);
            }}
          >
            {label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
