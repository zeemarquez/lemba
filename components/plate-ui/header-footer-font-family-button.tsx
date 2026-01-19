'use client';

import type { DropdownMenuProps } from '@radix-ui/react-dropdown-menu';
import { FontFamilyPlugin } from '@platejs/basic-styles/react';
import { TypeIcon } from 'lucide-react';
import { KEYS } from 'platejs';
import { useEditorPlugin, useEditorSelector } from 'platejs/react';
import { useState, useMemo, Fragment } from 'react';

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/plate-ui/dropdown-menu';
import { useStore } from '@/lib/store';
import { cn } from '@/lib/utils';

import { ToolbarButton } from './toolbar';

const FONT_FAMILIES = [
  // Sans Serif
  { category: 'Sans Serif', label: 'Inter', value: "'Inter', sans-serif" },
  { category: 'Sans Serif', label: 'Roboto', value: 'Roboto, sans-serif' },
  { category: 'Sans Serif', label: 'Open Sans', value: "'Open Sans', sans-serif" },
  { category: 'Sans Serif', label: 'Montserrat', value: 'Montserrat, sans-serif' },
  { category: 'Sans Serif', label: 'Outfit', value: "'Outfit', sans-serif" },
  { category: 'Sans Serif', label: 'System', value: 'system-ui, sans-serif' },

  // Serif
  { category: 'Serif', label: 'Times New Roman', value: "'Times New Roman', serif" },
  { category: 'Serif', label: 'Georgia', value: "'Georgia', serif" },
  { category: 'Serif', label: 'Merriweather', value: 'Merriweather, serif' },
  { category: 'Serif', label: 'Playfair Display', value: "'Playfair Display', serif" },
  { category: 'Serif', label: 'Lora', value: 'Lora, serif' },

  // Mono
  { category: 'Monospace', label: 'JetBrains Mono', value: "'JetBrains Mono', monospace" },
  { category: 'Monospace', label: 'Fira Code', value: "'Fira Code', monospace" },
  { category: 'Monospace', label: 'Source Code Pro', value: "'Source Code Pro', monospace" },
] as const;

export function HeaderFooterFontFamilyButton(props: DropdownMenuProps) {
  const { tf } = useEditorPlugin(FontFamilyPlugin);
  const [open, setOpen] = useState(false);
  const customFonts = useStore((state) => state.customFonts);

  const allFontFamilies = useMemo(() => {
    const custom = customFonts.map(f => ({
      category: 'Custom',
      label: f.family,
      value: `'${f.family}'`
    }));
    return [...FONT_FAMILIES, ...custom];
  }, [customFonts]);

  const currentFontFamily = useEditorSelector((editor) => {
    const fontFamily = editor.api.marks()?.[KEYS.fontFamily];
    return fontFamily as string | undefined;
  }, []);

  const currentLabel = allFontFamilies.find(f => f.value === currentFontFamily)?.label || 'Font';

  return (
    <DropdownMenu modal={false} onOpenChange={setOpen} open={open} {...props}>
      <DropdownMenuTrigger asChild>
        <ToolbarButton isDropdown pressed={open} tooltip="Font Family" className="min-w-[80px]">
          <TypeIcon className="size-4 mr-1" />
          <span className="text-xs truncate max-w-[60px]">{currentLabel}</span>
        </ToolbarButton>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="start" className="min-w-[160px] max-h-[400px] overflow-y-auto no-scrollbar">
        {['Sans Serif', 'Serif', 'Monospace', 'Custom'].map((category, index) => {
          const categoryFonts = allFontFamilies.filter(f => f.category === category);
          if (categoryFonts.length === 0) return null;

          return (
            <Fragment key={category}>
              <div className={cn(
                "px-2 py-1.5 text-[10px] font-bold text-muted-foreground uppercase tracking-widest opacity-70",
                index > 0 && "mt-1 border-t border-border/50 pt-2"
              )}>
                {category}
              </div>
              {categoryFonts.map(({ label, value }) => (
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
            </Fragment>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
