'use client';

import { 
  CalendarIcon, 
  FileTextIcon, 
  HashIcon,
  Settings2Icon,
  ChevronDownIcon,
  BoldIcon,
  ItalicIcon,
  UnderlineIcon
} from 'lucide-react';
import type { TElement } from 'platejs';
import type { PlateElementProps } from 'platejs/react';
import {
  PlateElement,
  useFocused,
  useReadOnly,
  useSelected,
  useEditorRef
} from 'platejs/react';
import { useState, useMemo, Fragment } from 'react';
import { useStore } from '@/lib/store';
import { cn } from '@/lib/utils';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from './popover';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from './dropdown-menu';
import { Button } from './button';
import { Input } from './input';

export interface TPlaceholderElement extends TElement {
  placeholderType: 'page' | 'date' | 'title' | 'totalPages';
  format?: string;
  fontFamily?: string;
  fontSize?: string;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
}

// Available fonts in Typst WASM compiler (from typst.ts text assets)
const FONT_FAMILIES = [
  { label: 'Inherit', value: '', category: 'Default' },
  { label: 'Libertinus Serif (Classic)', value: "'Libertinus Serif', serif", category: 'Serif' },
  { label: 'New Computer Modern (Academic)', value: "'New Computer Modern', serif", category: 'Serif' },
  { label: 'DejaVu Sans Mono (Code)', value: "'DejaVu Sans Mono', monospace", category: 'Monospace' },
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
      label: `${f.family} (Custom)`,
      value: `'${f.family}'`,
      category: 'Custom'
    }));
    return [...FONT_FAMILIES, ...custom];
  }, [customFonts]);

  const updateElement = (updates: Partial<TPlaceholderElement>) => {
    editor.tf.setNodes(updates, { at: editor.api.findPath(element) });
  };

  const getIcon = () => {
    switch (element.placeholderType) {
      case 'page': return <HashIcon className="size-3 mr-1" />;
      case 'totalPages': return <HashIcon className="size-3 mr-1" />;
      case 'date': return <CalendarIcon className="size-3 mr-1" />;
      case 'title': return <FileTextIcon className="size-3 mr-1" />;
      default: return null;
    }
  };

  const getLabel = () => {
    switch (element.placeholderType) {
      case 'page': return 'Page Number';
      case 'totalPages': return 'Total Pages';
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
        style={{
          fontFamily: element.fontFamily || undefined,
          fontWeight: element.bold ? 'bold' : undefined,
          fontStyle: element.italic ? 'italic' : undefined,
          textDecoration: element.underline ? 'underline' : undefined,
        }}
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

            {/* Font Settings - shared by all placeholder types */}
            <div className="space-y-3">
              <div className="space-y-1">
                <label className="text-[10px] font-bold uppercase text-zinc-400">Font Family</label>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button className="w-full bg-zinc-50 border border-zinc-200 rounded-lg px-2 py-1.5 text-xs outline-none hover:bg-zinc-100 flex items-center justify-between">
                      <span style={{ fontFamily: element.fontFamily || 'inherit' }}>
                        {allFontFamilies.find(f => f.value === (element.fontFamily || ''))?.label || 'Inherit'}
                      </span>
                      <ChevronDownIcon className="size-3 text-zinc-400" />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent className="w-56 max-h-[300px] overflow-y-auto">
                    {['Default', 'Serif', 'Monospace', 'Custom'].map((category, index) => {
                      const categoryFonts = allFontFamilies.filter(f => f.category === category);
                      if (categoryFonts.length === 0) return null;

                      return (
                        <Fragment key={category}>
                          <div className={cn(
                            "px-2 py-1.5 text-[10px] font-bold text-zinc-400 uppercase tracking-wider",
                            index > 0 && "mt-1 border-t border-zinc-100 pt-2"
                          )}>
                            {category}
                          </div>
                          {categoryFonts.map((font) => (
                            <DropdownMenuItem
                              key={font.value}
                              className={cn(
                                "text-xs cursor-pointer",
                                (element.fontFamily || '') === font.value && "bg-zinc-100 font-semibold"
                              )}
                              style={{ fontFamily: font.value || 'inherit' }}
                              onSelect={() => updateElement({ fontFamily: font.value })}
                            >
                              {font.label}
                            </DropdownMenuItem>
                          ))}
                        </Fragment>
                      );
                    })}
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-bold uppercase text-zinc-400">Font Size</label>
                <Input
                  type="text"
                  placeholder="e.g. 12px"
                  className="h-8 text-xs"
                  value={element.fontSize || ''}
                  onChange={(e) => updateElement({ fontSize: e.target.value })}
                />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-bold uppercase text-zinc-400">Style</label>
                <div className="flex gap-1">
                  <button
                    className={cn(
                      "p-1.5 rounded-md border transition-colors",
                      element.bold 
                        ? "bg-zinc-900 text-white border-zinc-900" 
                        : "bg-zinc-50 text-zinc-600 border-zinc-200 hover:bg-zinc-100"
                    )}
                    onClick={() => updateElement({ bold: !element.bold })}
                    title="Bold"
                  >
                    <BoldIcon className="size-4" />
                  </button>
                  <button
                    className={cn(
                      "p-1.5 rounded-md border transition-colors",
                      element.italic 
                        ? "bg-zinc-900 text-white border-zinc-900" 
                        : "bg-zinc-50 text-zinc-600 border-zinc-200 hover:bg-zinc-100"
                    )}
                    onClick={() => updateElement({ italic: !element.italic })}
                    title="Italic"
                  >
                    <ItalicIcon className="size-4" />
                  </button>
                  <button
                    className={cn(
                      "p-1.5 rounded-md border transition-colors",
                      element.underline 
                        ? "bg-zinc-900 text-white border-zinc-900" 
                        : "bg-zinc-50 text-zinc-600 border-zinc-200 hover:bg-zinc-100"
                    )}
                    onClick={() => updateElement({ underline: !element.underline })}
                    title="Underline"
                  >
                    <UnderlineIcon className="size-4" />
                  </button>
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
            )}

            {element.placeholderType === 'totalPages' && (
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
