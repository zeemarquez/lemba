'use client';

import * as React from 'react';
import { createPlatePlugin } from 'platejs/react';
import type { PlateEditor, RenderNodeWrapper } from 'platejs/react';

import { useCollapsedHeadings } from '@/components/plate-ui/collapsible-headings-context';

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

type ChildNode = { type?: string; id?: string };

/**
 * Determines whether a block at `index` should be hidden.
 *
 * Walk backwards through the document. Skip non-headings and headings that
 * are the same level or deeper than the current threshold (they are siblings
 * or children of siblings — not ancestors). Only a heading with a strictly
 * LOWER level is a parent/owner of the current block.
 *
 * When the owner is not directly collapsed, cascade upward: lower the
 * threshold to the owner's level and continue walking to find the owner's
 * parent, etc. This propagates collapse state across any nesting depth.
 *
 * Example with # H1 collapsed:
 *   # H1 (idx 0) ← collapsed
 *   ## H2 (idx 1)   → owner=H1 → collapsed → hidden ✓
 *   ### H3 (idx 2)  → owner=H2 (not collapsed) → cascade → owner=H1 → collapsed → hidden ✓
 *   ## H2b (idx 3)  → skip ### H3 (deeper), skip ## H2 (same level), owner=H1 → hidden ✓
 */
function isBlockHidden(
  children: ChildNode[],
  collapsed: Set<string>,
  index: number
): boolean {
  const current = children[index];
  if (!current) return false;

  const currentType = current.type;
  let currentLevel: number = currentType && HEADING_TYPES.has(currentType)
    ? getHeadingLevel(currentType)
    : Infinity;

  for (let j = index - 1; j >= 0; j--) {
    const node = children[j];
    const type = node?.type;
    if (!type || !HEADING_TYPES.has(type)) continue;

    const headingLevel = getHeadingLevel(type);

    // Skip headings at the same level (siblings) or deeper (children of
    // siblings). They are NOT parents of the current block.
    if (headingLevel >= currentLevel) continue;

    // headingLevel < currentLevel — this heading owns the current block.
    const id = node.id ?? String(j);
    if (collapsed.has(id)) return true;

    // Owner is not collapsed. Cascade: now find the owner's parent.
    currentLevel = headingLevel;
  }

  return false;
}

const SectionVisibilityWrapper: RenderNodeWrapper = (props) => {
  const { editor, element, path } = props;
  const { collapsed } = useCollapsedHeadings();

  const hidden = React.useMemo(() => {
    if (!editor || !element || !Array.isArray(path) || path.length !== 1) return false;
    const index = (path as number[])[0];
    const children = editor.children as ChildNode[];
    if (!Array.isArray(children) || index >= children.length) return false;
    return isBlockHidden(children, collapsed, index);
  // editor.children reference changes on every document edit — that's exactly
  // what we need to recompute visibility.
  }, [editor?.children, collapsed, path, element]);

  if (!hidden) return;

  return (innerProps) => (
    <div style={{ display: 'none' }} aria-hidden="true">
      {innerProps.children}
    </div>
  );
};

export const CollapsibleHeadingsPlugin = createPlatePlugin({
  key: 'collapsible_headings',
  render: {
    aboveNodes: SectionVisibilityWrapper,
  },
});
