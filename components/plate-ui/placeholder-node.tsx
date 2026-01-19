'use client';

import { 
  CalendarIcon, 
  FileTextIcon, 
  HashIcon,
  TypeIcon,
  Settings2Icon
} from 'lucide-react';
import type { TElement } from 'platejs';
import { KEYS } from 'platejs';
import type { PlateElementProps } from 'platejs/react';
import {
  PlateElement,
  useFocused,
  useReadOnly,
  useSelected,
  useEditorRef
} from 'platejs/react';
import { useState, useMemo } from 'react';
import { useStore } from '@/lib/store';
import { cn } from '@/lib/utils';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from './popover';
import { Button } from './button';
import { Input } from './input';

export interface TPlaceholderElement extends TElement {
  placeholderType: 'page' | 'date' | 'title';
  format?: string;
  offset?: number;
  fontFamily?: string;
  fontSize?: string;
}

const FONT_FAMILIES = [
  { label: 'Inherit', value: '' },
  { label: 'Inter', value: "'Inter', sans-serif" },
  { label: 'Times New Roman', value: "'Times New Roman', serif" },
  { label: 'Georgia', value: "'Georgia', serif" },
  { label: 'Outfit', value: "'Outfit', sans-serif" },
  { label: 'JetBrains Mono', value: "'JetBrains Mono', monospace" },
  { label: 'System', value: 'system-ui, sans-serif' },
];

const DATE_FORMATS = [
  { label: 'Default (MM/DD/YYYY)', value: 'default' },
  { label: 'ISO (YYYY-MM-DD)', value: 'iso' },
  { label: 'Long (Month DD, YYYY)', value: 'long' },
  { label: 'Short (M/D/YY)', value: 'short' },
];

const PAGE_FORMATS = [
  { label: '1, 2, 3', value: 'decimal' },
  { label: 'i, ii, iii', value: 'lower-roman' },
  { label: 'I, II, III', value: 'upper-roman' },
  { label: 'a, b, c', value: 'lower-alpha' },
  { label: 'A, B, C', value: 'upper-alpha' },
];

export function PlaceholderElement(props: PlateElementProps<TPlaceholderElement>) {
  const { element } = props;
  const selected = useSelected();
  const focused = useFocused();
  const readOnly = useReadOnly();
  const editor = useEditorRef();
  const customFonts = useStore((state) => state.customFonts);

  const [open, setOpen] = useState(false);

  const allFontFamilies = useMemo(() => {
    const custom = customFonts.map(f => ({
      label: f.family,
      value: `'${f.family}'`
    }));
    return [...FONT_FAMILIES, ...custom];
  }, [customFonts]);

  const updateElement = (updates: Partial<TPlaceholderElement>) => {
    editor.tf.setNodes(updates, { at: editor.api.findPath(element) });
  };

  const getIcon = () => {
    switch (element.placeholderType) {
      case 'page': return <HashIcon className="size-3 mr-1" />;
      case 'date': return <CalendarIcon className="size-3 mr-1" />;
      case 'title': return <FileTextIcon className="size-3 mr-1" />;
      default: return null;
    }
  };

  const getLabel = () => {
    switch (element.placeholderType) {
      case 'page': return 'Page Number';
      case 'date': return 'Current Date';
      case 'title': return 'File Title';
      default: return 'Placeholder';
    }
  };

  return (
    <PlateElement
      {...props}
    >
      <span
        contentEditable={false}
        className={cn(
          'inline-flex items-center rounded-md bg-zinc-100 px-2 py-0.5 align-baseline font-medium text-xs text-zinc-900 border border-zinc-200 shadow-sm transition-all',
          !readOnly && 'cursor-pointer hover:bg-zinc-200',
          selected && focused && 'ring-2 ring-zinc-900 ring-offset-1'
        )}
        style={element.fontFamily ? { fontFamily: element.fontFamily } : undefined}
        onClick={() => !readOnly && setOpen(true)}
      >
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <span className="flex items-center">
              {getIcon()}
              {getLabel()}
            </span>
          </PopoverTrigger>
          <PopoverContent className="w-64 p-4 space-y-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-2 pb-2 border-b">
              <Settings2Icon className="size-4 text-zinc-500" />
              <h4 className="font-semibold text-sm">{getLabel()} Settings</h4>
            </div>

            {/* Font Settings */}
            <div className="space-y-3">
              <div className="space-y-1">
                <label className="text-[10px] font-bold uppercase text-zinc-400">Font Family</label>
                <select
                  className="w-full bg-zinc-50 border border-zinc-200 rounded-lg px-2 py-1.5 text-xs outline-none"
                  value={element.fontFamily || ''}
                  onChange={(e) => updateElement({ fontFamily: e.target.value })}
                >
                  {allFontFamilies.map(f => (
                    <option key={f.value} value={f.value}>{f.label}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-bold uppercase text-zinc-400">Font Size</label>
                <div className="flex items-center gap-2">
                  <Input
                    type="text"
                    placeholder="e.g. 12px"
                    className="h-8 text-xs"
                    value={element.fontSize || ''}
                    onChange={(e) => updateElement({ fontSize: e.target.value })}
                  />
                </div>
              </div>
            </div>

            {/* Type Specific Settings */}
            {element.placeholderType === 'date' && (
              <div className="space-y-1">
                <label className="text-[10px] font-bold uppercase text-zinc-400">Date Format</label>
                <select
                  className="w-full bg-zinc-50 border border-zinc-200 rounded-lg px-2 py-1.5 text-xs outline-none"
                  value={element.format || 'default'}
                  onChange={(e) => updateElement({ format: e.target.value })}
                >
                  {DATE_FORMATS.map(f => (
                    <option key={f.value} value={f.value}>{f.label}</option>
                  ))}
                </select>
              </div>
            )}

            {element.placeholderType === 'page' && (
              <div className="space-y-3">
                <div className="space-y-1">
                  <label className="text-[10px] font-bold uppercase text-zinc-400">Number Format</label>
                  <select
                    className="w-full bg-zinc-50 border border-zinc-200 rounded-lg px-2 py-1.5 text-xs outline-none"
                    value={element.format || 'decimal'}
                    onChange={(e) => updateElement({ format: e.target.value })}
                  >
                    {PAGE_FORMATS.map(f => (
                      <option key={f.value} value={f.value}>{f.label}</option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold uppercase text-zinc-400">Offset (Start at)</label>
                  <Input
                    type="number"
                    className="h-8 text-xs"
                    value={element.offset || 0}
                    onChange={(e) => updateElement({ offset: parseInt(e.target.value) || 0 })}
                  />
                </div>
              </div>
            )}

            <div className="pt-2 border-t flex justify-end">
              <Button size="sm" variant="outline" className="h-7 text-[10px]" onClick={() => setOpen(false)}>
                Close
              </Button>
            </div>
          </PopoverContent>
        </Popover>
        {props.children}
      </span>
    </PlateElement>
  );
}
