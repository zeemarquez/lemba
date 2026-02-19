'use client';

import { isOrderedList } from '@platejs/list';
import {
  useTodoListElement,
  useTodoListElementState,
} from '@platejs/list/react';
import type { TListElement } from 'platejs';
import {
  type PlateElementProps,
  type RenderNodeWrapper,
  useEditorRef,
  useReadOnly,
} from 'platejs/react';
import type React from 'react';

import { Checkbox } from '@/components/plate-ui/checkbox';
import { cn } from '@/lib/utils';

const config: Record<
  string,
  {
    Li: React.FC<PlateElementProps>;
    Marker: React.FC<PlateElementProps>;
  }
> = {
  todo: {
    Li: TodoLi,
    Marker: TodoMarker,
  },
};

export const BlockList: RenderNodeWrapper = (props) => {
  if (!props.element.listStyleType) return;

  return (props) => <List {...props} />;
};

/**
 * Build a hierarchical decimal label (e.g. "2.1" or "1.3.2") for ordered list
 * items at indent level > 1.
 *
 * Plate's "indent list" stores every list item as a flat top-level node in
 * editor.children with an `indent` property (depth) and a `listStart` property
 * (sequential counter within that depth). Because the <ol> elements are siblings
 * rather than properly nested, CSS counters cannot produce hierarchical numbers
 * automatically — we have to compute the label in JavaScript by walking backwards
 * through the flat children array to collect the counter value at each ancestor
 * indent level.
 *
 * Returns null when:
 *  - the list style is not "decimal" (unordered / todo lists)
 *  - the item is at indent level 1 (native <ol> counter is sufficient)
 *  - an ancestor level is non-decimal (mixed ordered/unordered hierarchy)
 *  - the element cannot be located in the top-level children array
 */
function getHierarchicalLabel(
  element: TListElement,
  editorChildren: any[]
): string | null {
  const indent = (element.indent as number) ?? 1;
  const listStart = (element.listStart as number) ?? 1;

  if ((element.listStyleType as string) !== 'decimal') return null;
  if (indent <= 1) return null;

  // Locate this element in the flat top-level children (reference equality
  // is safe here: Plate/Slate never copies node objects during rendering).
  const nodeIndex = editorChildren.indexOf(element);
  if (nodeIndex === -1) return null;

  const numbers: number[] = [listStart];
  let targetIndent = indent - 1;

  for (let i = nodeIndex - 1; i >= 0 && targetIndent >= 1; i--) {
    const node = editorChildren[i] as any;
    const nodeIndent = (node.indent as number) ?? 0;
    const nodeListStyleType = node.listStyleType as string | undefined;

    if (!nodeListStyleType || !nodeIndent) {
      // Non-list node (heading, plain paragraph, etc.) — keep scanning.
      continue;
    }

    if (nodeIndent === targetIndent) {
      if (nodeListStyleType !== 'decimal') return null; // mixed hierarchy
      numbers.unshift((node.listStart as number) ?? 1);
      targetIndent--;
    } else if (nodeIndent < targetIndent) {
      // Skipped past the target indent level without a match — give up.
      break;
    }
    // nodeIndent > targetIndent → deeper item, skip it.
  }

  if (targetIndent > 0) return null; // could not resolve the full hierarchy

  return numbers.join('.');
}

function List(props: PlateElementProps) {
  const { listStart, listStyleType } = props.element as TListElement;
  const editor = useEditorRef();
  const { Li, Marker } = config[listStyleType] ?? {};
  const ListTag = isOrderedList(props.element) ? 'ol' : 'ul';

  const label = getHierarchicalLabel(
    props.element as TListElement,
    editor.children as any[]
  );

  return (
    <ListTag
      className="relative m-0 p-0"
      start={label ? undefined : listStart}
      style={{ listStyleType: label ? 'none' : listStyleType }}
    >
      {Marker && <Marker {...props} />}
      {Li ? (
        <Li {...props} />
      ) : label ? (
        // Render a custom hierarchical marker (e.g. "2.1.") positioned to the
        // left of the list item content, matching where the native decimal
        // marker would appear. The <ol> is already position:relative so the
        // absolute span is anchored to it.
        <li>
          <span
            contentEditable={false}
            className="pointer-events-none absolute select-none tabular-nums"
            style={{
              left: 0,
              transform: 'translateX(-100%)',
              paddingRight: '0.25em',
            }}
          >
            {label}.
          </span>
          {props.children}
        </li>
      ) : (
        <li>{props.children}</li>
      )}
    </ListTag>
  );
}

function TodoMarker(props: PlateElementProps) {
  const state = useTodoListElementState({ element: props.element });
  const { checkboxProps } = useTodoListElement(state);
  const readOnly = useReadOnly();

  return (
    <div contentEditable={false}>
      <Checkbox
        className={cn(
          '-left-6 absolute top-1',
          readOnly && 'pointer-events-none'
        )}
        {...checkboxProps}
      />
    </div>
  );
}

function TodoLi(props: PlateElementProps) {
  return (
    <li
      className={cn(
        'list-none',
        (props.element.checked as boolean) &&
          'text-muted-foreground line-through'
      )}
    >
      {props.children}
    </li>
  );
}
