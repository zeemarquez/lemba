'use client';

import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { ChevronDown, ChevronRight } from 'lucide-react';

import type { PlateElementProps } from 'platejs/react';
import { PlateElement, useEditorRef, useElement, usePath } from 'platejs/react';

import { useCollapsedHeadings } from '@/components/plate-ui/collapsible-headings-context';
import { cn } from '@/lib/utils';

const HEADING_TYPES = new Set(['h1', 'h2', 'h3', 'h4', 'h5', 'h6']);

function getHeadingLevel(type: string): number {
  if (type === 'h1') return 1;
  if (type === 'h2') return 2;
  if (type === 'h3') return 3;
  if (type === 'h4') return 4;
  if (type === 'h5') return 5;
  if (type === 'h6') return 6;
  return 0;
}

const headingVariants = cva('relative mb-1', {
  variants: {
    variant: {
      h1: 'mt-[1.6em] pb-1 font-bold font-heading text-4xl',
      h2: 'mt-[1.4em] pb-px font-heading font-semibold text-2xl tracking-tight',
      h3: 'mt-[1em] pb-px font-heading font-semibold text-xl tracking-tight',
      h4: 'mt-[0.75em] font-heading font-semibold text-lg tracking-tight',
      h5: 'mt-[0.75em] font-semibold text-lg tracking-tight',
      h6: 'mt-[0.75em] font-semibold text-base tracking-tight',
    },
  },
});

export function HeadingElement({
  variant = 'h1',
  ...props
}: PlateElementProps & VariantProps<typeof headingVariants>) {
  const editor = useEditorRef();
  const element = useElement();
  const path = usePath();
  const { collapsed, toggle } = useCollapsedHeadings();

  const pathSafe: number[] = Array.isArray(path) ? (path as number[]) : [];
  const isTopLevel = pathSafe.length === 1;

  // Use the element's stable Plate-assigned id as the collapse key.
  // This remains correct even when blocks are added/deleted (unlike index).
  const collapseKey = isTopLevel
    ? ((element as any).id as string | undefined) ?? String(pathSafe[0])
    : null;

  const isCollapsed = collapseKey !== null && collapsed.has(collapseKey);
  const level = getHeadingLevel(variant ?? 'h1');

  /**
   * A heading "has children" — and therefore shows a collapse arrow — when
   * there is at least one block between this heading and the next
   * same-or-higher-level heading (or the end of the document).
   *
   * Rules:
   * - Scan forward from idx+1.
   * - If a same-or-higher-level heading is found at position `i`:
   *     - `i > idx + 1` → there is at least one block between them → true
   *     - `i === idx + 1` → headings are immediately adjacent → false
   * - If no closing heading is found, there are children if this is not
   *   the last block in the document.
   */
  const hasChildren = React.useMemo(() => {
    if (!isTopLevel || !Array.isArray(editor?.children)) return false;
    const children = editor.children as { type?: string }[];
    const idx = pathSafe[0];
    for (let i = idx + 1; i < children.length; i++) {
      const type = children[i]?.type;
      if (type && HEADING_TYPES.has(type) && getHeadingLevel(type) <= level) {
        // Found a sibling/parent heading — children exist only if there is
        // at least one block between idx and i.
        return i > idx + 1;
      }
    }
    return idx < children.length - 1;
  }, [isTopLevel, editor?.children, pathSafe, level]);

  const handleChevronClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (collapseKey !== null) toggle(collapseKey);
  };

  return (
    <PlateElement
      as={variant!}
      className={cn(headingVariants({ variant }), 'flex items-center gap-0')}
      {...props}
    >
      {isTopLevel && (
        <span
          contentEditable={false}
          className={cn(
            'absolute left-0 flex items-center justify-center rounded w-8 h-8 -translate-x-12 -translate-y-0.5',
            'select-none',
            hasChildren
              ? 'cursor-pointer hover:bg-accent/50 text-muted-foreground'
              : 'pointer-events-none opacity-0'
          )}
          onClick={hasChildren ? handleChevronClick : undefined}
          role={hasChildren ? 'button' : undefined}
          tabIndex={hasChildren ? 0 : undefined}
          title={!hasChildren ? undefined : isCollapsed ? 'Expand section' : 'Collapse section'}
          onKeyDown={
            hasChildren
              ? (e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    handleChevronClick(e as unknown as React.MouseEvent);
                  }
                }
              : undefined
          }
        >
          {hasChildren &&
            (isCollapsed ? (
              <ChevronRight size={20} strokeWidth={2.5} className="text-muted-foreground" />
            ) : (
              <ChevronDown size={20} strokeWidth={2.5} className="text-muted-foreground" />
            ))}
        </span>
      )}
      <span className="min-w-0 flex-1">{props.children}</span>
    </PlateElement>
  );
}

export function H1Element(props: PlateElementProps) {
  return <HeadingElement variant="h1" {...props} />;
}

export function H2Element(props: PlateElementProps) {
  return <HeadingElement variant="h2" {...props} />;
}

export function H3Element(props: PlateElementProps) {
  return <HeadingElement variant="h3" {...props} />;
}

export function H4Element(props: PlateElementProps) {
  return <HeadingElement variant="h4" {...props} />;
}

export function H5Element(props: PlateElementProps) {
  return <HeadingElement variant="h5" {...props} />;
}

export function H6Element(props: PlateElementProps) {
  return <HeadingElement variant="h6" {...props} />;
}
