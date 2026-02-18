'use client';

import {
  useBlockSelected,
} from '@platejs/selection/react';
import {
  TablePlugin,
  TableProvider,
  useTableMergeState,
} from '@platejs/table/react';
import { PopoverAnchor } from '@radix-ui/react-popover';
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  CombineIcon,
  SquareSplitHorizontalIcon,
  Trash2Icon,
  XIcon,
} from 'lucide-react';
import {
  type TTableCellElement,
  type TTableElement,
  type TTableRowElement,
} from 'platejs';
import {
  PlateElement,
  type PlateElementProps,
  useEditorPlugin,
  useEditorRef,
  useEditorSelector,
  useElement,
  useFocusedLast,
  useReadOnly,
  useRemoveNodeButton,
  useSelected,
  withHOC,
} from 'platejs/react';
import * as React from 'react';

import { Popover, PopoverContent } from '@/components/plate-ui/popover';
import { cn } from '@/lib/utils';
import { blockSelectionVariants } from './block-selection';
import {
  Toolbar,
  ToolbarButton,
  ToolbarGroup,
} from './toolbar';
export const TableElement = withHOC(
  TableProvider,
  function TableElement({
    children,
    ...props
  }: PlateElementProps<TTableElement>) {
    const readOnly = useReadOnly();

    const isSelectingTable = useBlockSelected(props.element.id as string);

    const content = (
      <PlateElement
        {...props}
        className={cn('overflow-x-auto py-5 relative')}
        style={{ width: undefined, minWidth: undefined, maxWidth: undefined }}
      >
        <div className="group/table relative h-full w-full">
          <table className="mr-0 table border-collapse table-auto w-full">
            <tbody>{children}</tbody>
          </table>

          {isSelectingTable && (
            <div className={blockSelectionVariants()} contentEditable={false} />
          )}
        </div>
      </PlateElement>
    );

    if (readOnly) {
      return content;
    }

    return <TableFloatingToolbar>{content}</TableFloatingToolbar>;
  }
);

function TableFloatingToolbar({
  children,
  ...props
}: React.ComponentProps<typeof PopoverContent>) {
  const { tf } = useEditorPlugin(TablePlugin);
  const selected = useSelected();
  const element = useElement<TTableElement>();
  const { props: buttonProps } = useRemoveNodeButton({ element });
  const collapsedInside = useEditorSelector(
    (editor) => selected && editor.api.isCollapsed(),
    [selected]
  );
  const isFocusedLast = useFocusedLast();

  const { canMerge, canSplit } = useTableMergeState();

  return (
    <Popover
      modal={false}
      open={isFocusedLast && (canMerge || canSplit || collapsedInside)}
    >
      <PopoverAnchor asChild>{children}</PopoverAnchor>
      <PopoverContent
        asChild
        contentEditable={false}
        onOpenAutoFocus={(e) => e.preventDefault()}
        {...props}
      >
        <Toolbar
          className="scrollbar-hide flex w-auto max-w-[80vw] flex-row overflow-x-auto rounded-md border bg-popover p-1 shadow-md print:hidden"
          contentEditable={false}
        >
          <ToolbarGroup>
            {canMerge && (
              <ToolbarButton
                onClick={() => tf.table.merge()}
                onMouseDown={(e) => e.preventDefault()}
                tooltip="Merge cells"
              >
                <CombineIcon />
              </ToolbarButton>
            )}
            {canSplit && (
              <ToolbarButton
                onClick={() => tf.table.split()}
                onMouseDown={(e) => e.preventDefault()}
                tooltip="Split cell"
              >
                <SquareSplitHorizontalIcon />
              </ToolbarButton>
            )}

            {collapsedInside && (
              <ToolbarButton tooltip="Delete table" {...buttonProps}>
                <Trash2Icon />
              </ToolbarButton>
            )}
          </ToolbarGroup>

          {collapsedInside && (
            <ToolbarGroup>
              <ToolbarButton
                onClick={() => {
                  tf.insert.tableRow({ before: true });
                }}
                onMouseDown={(e) => e.preventDefault()}
                tooltip="Insert row before"
              >
                <ArrowUp />
              </ToolbarButton>
              <ToolbarButton
                onClick={() => {
                  tf.insert.tableRow();
                }}
                onMouseDown={(e) => e.preventDefault()}
                tooltip="Insert row after"
              >
                <ArrowDown />
              </ToolbarButton>
              <ToolbarButton
                onClick={() => {
                  tf.remove.tableRow();
                }}
                onMouseDown={(e) => e.preventDefault()}
                tooltip="Delete row"
              >
                <XIcon />
              </ToolbarButton>
            </ToolbarGroup>
          )}

          {collapsedInside && (
            <ToolbarGroup>
              <ToolbarButton
                onClick={() => {
                  tf.insert.tableColumn({ before: true });
                }}
                onMouseDown={(e) => e.preventDefault()}
                tooltip="Insert column before"
              >
                <ArrowLeft />
              </ToolbarButton>
              <ToolbarButton
                onClick={() => {
                  tf.insert.tableColumn();
                }}
                onMouseDown={(e) => e.preventDefault()}
                tooltip="Insert column after"
              >
                <ArrowRight />
              </ToolbarButton>
              <ToolbarButton
                onClick={() => {
                  tf.remove.tableColumn();
                }}
                onMouseDown={(e) => e.preventDefault()}
                tooltip="Delete column"
              >
                <XIcon />
              </ToolbarButton>
            </ToolbarGroup>
          )}
        </Toolbar>
      </PopoverContent>
    </Popover>
  );
}

export function TableRowElement({
  children,
  ...props
}: PlateElementProps<TTableRowElement>) {
  return (
    <PlateElement
      {...props}
      as="tr"
      className="group/row"
    >
      {children}
    </PlateElement>
  );
}

export function TableCellElement({
  isHeader,
  ...props
}: PlateElementProps<TTableCellElement> & {
  isHeader?: boolean;
}) {
  const element = props.element;

  return (
    <PlateElement
      {...props}
      as={isHeader ? 'th' : 'td'}
      className={cn(
        'relative align-top h-full overflow-visible border-none p-0',
        element.background ? 'bg-(--cellBackground)' : 'bg-background',
        isHeader && 'text-left *:m-0',
        'before:inset-0 before:size-full',
        "before:absolute before:box-border before:select-none before:content-['']",
        'before:border-t before:border-r before:border-b before:border-l before:border-border'
      )}
      style={
        {
          '--cellBackground': element.background,
          minWidth: 120,
          width: 'auto',
          maxWidth: 'none',
        } as React.CSSProperties
      }
    >
      <div className="relative z-20 box-border h-full px-3 py-2 flex flex-col">
        {props.children}
      </div>
    </PlateElement>
  );
}

export function TableCellHeaderElement(
  props: React.ComponentProps<typeof TableCellElement>
) {
  return <TableCellElement {...props} isHeader />;
}
