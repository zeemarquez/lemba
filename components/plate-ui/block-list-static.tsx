import { isOrderedList } from '@platejs/list';
import { CheckIcon } from 'lucide-react';
import type { RenderStaticNodeWrapper, TListElement } from 'platejs';
import type { SlateRenderElementProps } from 'platejs/static';
import type * as React from 'react';

import { cn } from '@/lib/utils';

const config: Record<
  string,
  {
    Li: React.FC<SlateRenderElementProps>;
    Marker: React.FC<SlateRenderElementProps>;
  }
> = {
  todo: {
    Li: TodoLiStatic,
    Marker: TodoMarkerStatic,
  },
};

export const BlockListStatic: RenderStaticNodeWrapper = (props) => {
  if (!props.element.listStyleType) return;

  return (props) => <List {...props} />;
};

/**
 * Same hierarchical label logic as BlockList but without React hooks so it
 * can be used in static (server-side) rendering.
 */
function getHierarchicalLabel(
  element: TListElement,
  editorChildren: any[]
): string | null {
  const indent = (element.indent as number) ?? 1;
  const listStart = (element.listStart as number) ?? 1;

  if ((element.listStyleType as string) !== 'decimal') return null;
  if (indent <= 1) return null;

  const nodeIndex = editorChildren.indexOf(element);
  if (nodeIndex === -1) return null;

  const numbers: number[] = [listStart];
  let targetIndent = indent - 1;

  for (let i = nodeIndex - 1; i >= 0 && targetIndent >= 1; i--) {
    const node = editorChildren[i] as any;
    const nodeIndent = (node.indent as number) ?? 0;
    const nodeListStyleType = node.listStyleType as string | undefined;

    if (!nodeListStyleType || !nodeIndent) continue;

    if (nodeIndent === targetIndent) {
      if (nodeListStyleType !== 'decimal') return null;
      numbers.unshift((node.listStart as number) ?? 1);
      targetIndent--;
    } else if (nodeIndent < targetIndent) {
      break;
    }
  }

  if (targetIndent > 0) return null;

  return numbers.join('.');
}

function List(props: SlateRenderElementProps) {
  const { listStart, listStyleType } = props.element as TListElement;
  const { Li, Marker } = config[listStyleType] ?? {};
  const ListTag = isOrderedList(props.element) ? 'ol' : 'ul';

  const label = getHierarchicalLabel(
    props.element as TListElement,
    (props.editor as any)?.children ?? []
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
        <li>
          <span
            style={{
              position: 'absolute',
              left: 0,
              transform: 'translateX(-100%)',
              paddingRight: '0.25em',
              userSelect: 'none',
              fontVariantNumeric: 'tabular-nums',
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

function TodoMarkerStatic(props: SlateRenderElementProps) {
  const checked = props.element.checked as boolean;

  return (
    <div contentEditable={false}>
      <button
        className={cn(
          'peer -left-6 pointer-events-none absolute top-1 size-4 shrink-0 rounded-sm border border-primary bg-background ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 data-[state=checked]:bg-primary data-[state=checked]:text-primary-foreground',
          props.className
        )}
        data-state={checked ? 'checked' : 'unchecked'}
        type="button"
      >
        <div className={cn('flex items-center justify-center text-current')}>
          {checked && <CheckIcon className="size-4" />}
        </div>
      </button>
    </div>
  );
}

function TodoLiStatic(props: SlateRenderElementProps) {
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
