'use client';

import { UnfoldVerticalIcon, Settings2Icon } from 'lucide-react';
import type { PlateElementProps } from 'platejs/react';
import {
  PlateElement,
  useFocused,
  useReadOnly,
  useSelected,
  useEditorRef,
} from 'platejs/react';
import { useState, useEffect, useRef } from 'react';
import { cn } from '@/lib/utils';
import type { TVerticalSpacerElement } from '@/components/plate-editor/plugins/vertical-spacer-kit';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from './popover';
import { Input } from './input';
import { Button } from './button';

export function VerticalSpacerElement(props: PlateElementProps<TVerticalSpacerElement>) {
  const { element } = props;
  const selected = useSelected();
  const focused = useFocused();
  const readOnly = useReadOnly();
  const editor = useEditorRef();

  const [open, setOpen] = useState(false);
  const [inputValue, setInputValue] = useState(String(element.height || 50));
  const [isDragging, setIsDragging] = useState<'top' | 'bottom' | null>(null);
  const startY = useRef(0);
  const startHeight = useRef(0);

  const height = element.height || 50;

  // Sync input value with element
  useEffect(() => {
    setInputValue(String(element.height || 50));
  }, [element.height]);

  const updateHeight = (newHeight: number) => {
    const clampedHeight = Math.max(10, Math.min(500, newHeight));
    editor.tf.setNodes(
      { height: clampedHeight },
      { at: editor.api.findPath(element) }
    );
  };

  const handleInputChange = (value: string) => {
    setInputValue(value);
  };

  const handleInputCommit = () => {
    const parsed = parseInt(inputValue, 10);
    if (!isNaN(parsed)) {
      updateHeight(parsed);
    } else {
      setInputValue(String(height));
    }
  };

  // Drag resize handlers
  const handleMouseDown = (direction: 'top' | 'bottom') => (e: React.MouseEvent) => {
    if (readOnly) return;
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(direction);
    startY.current = e.clientY;
    startHeight.current = height;
  };

  useEffect(() => {
    if (!isDragging) return;

    const handleMouseMove = (e: MouseEvent) => {
      const deltaY = e.clientY - startY.current;
      const multiplier = isDragging === 'top' ? -1 : 1;
      const newHeight = startHeight.current + deltaY * multiplier;
      updateHeight(newHeight);
    };

    const handleMouseUp = () => {
      setIsDragging(null);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging]);

  return (
    <PlateElement {...props}>
      <div
        contentEditable={false}
        className={cn(
          'relative group my-1 mx-auto w-full max-w-[300px] flex items-center justify-center',
          'rounded border-2 border-dashed transition-all',
          selected && focused ? 'border-ring' : 'border-muted-foreground/20',
          !readOnly && 'hover:border-muted-foreground/40'
        )}
        style={{ height }}
        onClick={() => !readOnly && setOpen(true)}
      >
        {/* Popover for editing */}
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <span
              className={cn(
                'inline-flex items-center gap-1.5 px-3 py-1 rounded-md',
                'bg-zinc-100 text-zinc-700 text-xs font-medium',
                'border border-zinc-200 shadow-sm',
                !readOnly && 'cursor-pointer hover:bg-zinc-200'
              )}
            >
              <UnfoldVerticalIcon className="size-3" />
              <span>{height}px</span>
            </span>
          </PopoverTrigger>
          <PopoverContent className="w-56 p-4 space-y-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-2 pb-2 border-b">
              <Settings2Icon className="size-4 text-zinc-500" />
              <h4 className="font-semibold text-sm">Vertical Spacing</h4>
            </div>

            <div className="space-y-1">
              <label className="text-[10px] font-bold uppercase text-zinc-400">Height (px)</label>
              <Input
                type="number"
                min={10}
                max={500}
                className="h-8 text-xs"
                value={inputValue}
                onChange={(e) => handleInputChange(e.target.value)}
                onBlur={handleInputCommit}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    handleInputCommit();
                    setOpen(false);
                  }
                }}
              />
              <p className="text-[10px] text-zinc-400">Range: 10px - 500px</p>
            </div>

            <div className="pt-2 border-t flex justify-end">
              <Button size="sm" variant="outline" className="h-7 text-[10px]" onClick={() => setOpen(false)}>
                Close
              </Button>
            </div>
          </PopoverContent>
        </Popover>

        {/* Top resize handle */}
        {!readOnly && (
          <div
            className={cn(
              'absolute -top-1.5 left-1/2 -translate-x-1/2 w-12 h-3 cursor-row-resize flex justify-center items-center',
              'opacity-0 group-hover:opacity-100 transition-opacity',
              isDragging === 'top' && 'opacity-100'
            )}
            onMouseDown={handleMouseDown('top')}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="w-8 h-[3px] rounded-full bg-ring" />
          </div>
        )}

        {/* Bottom resize handle */}
        {!readOnly && (
          <div
            className={cn(
              'absolute -bottom-1.5 left-1/2 -translate-x-1/2 w-12 h-3 cursor-row-resize flex justify-center items-center',
              'opacity-0 group-hover:opacity-100 transition-opacity',
              isDragging === 'bottom' && 'opacity-100'
            )}
            onMouseDown={handleMouseDown('bottom')}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="w-8 h-[3px] rounded-full bg-ring" />
          </div>
        )}
      </div>
      {props.children}
    </PlateElement>
  );
}
