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
  AlignCenterIcon,
  AlignLeftIcon,
  AlignRightIcon,
  AlignVerticalDistributeCenterIcon,
  AlignVerticalJustifyEndIcon,
  AlignVerticalJustifyStartIcon,
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  CombineIcon,
  EraserIcon,
  Grid2X2Icon,
  PaintBucketIcon,
  SquareCode,
  SquareSplitHorizontalIcon,
  Trash2Icon,
  XIcon,
} from 'lucide-react';
import type { TElement } from 'platejs';
import {
  KEYS,
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
import {
  ELEMENT_HTML_TABLE,
  ELEMENT_HTML_TABLE_ROW,
  ELEMENT_HTML_TABLE_CELL,
  ELEMENT_HTML_TABLE_HEADER_CELL,
} from '@/components/plate-editor/plugins/html-table-plugin';
import * as React from 'react';

import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/plate-ui/dropdown-menu';
import { Popover, PopoverContent } from '@/components/plate-ui/popover';
import { cn } from '@/lib/utils';
import { blockSelectionVariants } from './block-selection';
import {
  ColorDropdownMenuItems,
  DEFAULT_COLORS,
} from './font-color-toolbar-button';
import {
  BorderAllIcon,
  BorderBottomIcon,
  BorderLeftIcon,
  BorderNoneIcon,
  BorderRightIcon,
  BorderTopIcon,
} from './table-icons';
import {
  Toolbar,
  ToolbarButton,
  ToolbarGroup,
  ToolbarMenuGroup,
} from './toolbar';

function ConvertMarkdownTableToHtmlButton() {
  const editor = useEditorRef();
  const element = useElement<TTableElement>();

  const convertToHtmlTable = React.useCallback(() => {
    const path = editor.api.findPath(element);
    if (path == null) return;
    const rows = element.children as TTableRowElement[];
    if (!rows?.length) return;

    const at = [...path];

    // Use setNodes to mutate types in-place instead of remove+insert.
    // This keeps every path valid throughout the operation, so TableProvider
    // never tries to access a null/deleted node.
    // Wrap in setTimeout so TableProvider finishes its current render cycle
    // before the type changes trigger a new one.
    setTimeout(() => {
      editor.tf.withoutNormalizing(() => {
        // Table itself
        editor.tf.setNodes({ type: ELEMENT_HTML_TABLE }, { at });

        rows.forEach((row, rowIndex) => {
          const rowPath = [...at, rowIndex];
          editor.tf.setNodes({ type: ELEMENT_HTML_TABLE_ROW }, { at: rowPath });

          (row.children as TTableCellElement[]).forEach((cell, cellIndex) => {
            const cellPath = [...rowPath, cellIndex];
            const htmlCellType =
              cell.type === KEYS.th
                ? ELEMENT_HTML_TABLE_HEADER_CELL
                : ELEMENT_HTML_TABLE_CELL;
            editor.tf.setNodes({ type: htmlCellType }, { at: cellPath });
          });
        });
      });
    }, 0);
  }, [editor, element]);

  return (
    <ToolbarButton
      onClick={convertToHtmlTable}
      onMouseDown={(e) => e.preventDefault()}
      tooltip="Convert to HTML table"
    >
      <SquareCode />
    </ToolbarButton>
  );
}

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

const MARKDOWN_CELL_TYPES = [KEYS.td, KEYS.th];

function findMarkdownCell(editor: any) {
  if (!editor.selection) return null;
  return editor.api.node({
    match: { type: MARKDOWN_CELL_TYPES },
    at: editor.selection,
  } as any) as [TTableCellElement, number[]] | undefined;
}

function getDefaultCellBorders() {
  return {
    top: { size: 1 },
    right: { size: 1 },
    bottom: { size: 1 },
    left: { size: 1 },
  };
}

function MarkdownCellColorDropdownMenu() {
  const [open, setOpen] = React.useState(false);
  const editor = useEditorRef();

  const apply = React.useCallback(
    (color: string | null) => {
      setOpen(false);
      const entry = findMarkdownCell(editor);
      if (!entry) return;
      editor.tf.setNodes({ background: color }, { at: entry[1] });
    },
    [editor]
  );

  return (
    <DropdownMenu modal={false} onOpenChange={setOpen} open={open}>
      <DropdownMenuTrigger asChild>
        <ToolbarButton tooltip="Background color">
          <PaintBucketIcon />
        </ToolbarButton>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        <ToolbarMenuGroup label="Colors">
          <ColorDropdownMenuItems
            className="px-2"
            colors={DEFAULT_COLORS}
            updateColor={(c) => apply(c)}
          />
        </ToolbarMenuGroup>
        <DropdownMenuGroup>
          <DropdownMenuItem className="p-2" onClick={() => apply(null)}>
            <EraserIcon />
            <span>Clear</span>
          </DropdownMenuItem>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function MarkdownCellBordersDropdownMenu() {
  const editor = useEditorRef();

  const borders = useEditorSelector((ed) => {
    if (!ed.selection) return getDefaultCellBorders();
    const entry = findMarkdownCell(ed);
    if (!entry) return getDefaultCellBorders();
    return (entry[0] as any).borders || getDefaultCellBorders();
  }, []);

  const toggle = React.useCallback(
    (side: 'top' | 'right' | 'bottom' | 'left') => {
      const entry = findMarkdownCell(editor);
      if (!entry) return;
      const current = (entry[0] as any).borders || getDefaultCellBorders();
      const newBorders = {
        ...current,
        [side]: { size: current[side]?.size ? 0 : 1 },
      };
      editor.tf.setNodes({ borders: newBorders }, { at: entry[1] });
    },
    [editor]
  );

  const setAll = React.useCallback(
    (size: number) => {
      const entry = findMarkdownCell(editor);
      if (!entry) return;
      const b = { top: { size }, right: { size }, bottom: { size }, left: { size } };
      editor.tf.setNodes({ borders: b }, { at: entry[1] });
    },
    [editor]
  );

  const hasAll =
    borders.top?.size && borders.right?.size && borders.bottom?.size && borders.left?.size;
  const hasNone =
    !borders.top?.size && !borders.right?.size && !borders.bottom?.size && !borders.left?.size;

  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <ToolbarButton tooltip="Cell borders">
          <Grid2X2Icon />
        </ToolbarButton>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        className="min-w-[220px]"
        side="right"
        sideOffset={0}
        onCloseAutoFocus={(e) => { e.preventDefault(); editor.tf.focus(); }}
      >
        <DropdownMenuGroup>
          <DropdownMenuCheckboxItem
            checked={!!borders.top?.size}
            onCheckedChange={() => toggle('top')}
          >
            <BorderTopIcon /> <div>Top Border</div>
          </DropdownMenuCheckboxItem>
          <DropdownMenuCheckboxItem
            checked={!!borders.right?.size}
            onCheckedChange={() => toggle('right')}
          >
            <BorderRightIcon /> <div>Right Border</div>
          </DropdownMenuCheckboxItem>
          <DropdownMenuCheckboxItem
            checked={!!borders.bottom?.size}
            onCheckedChange={() => toggle('bottom')}
          >
            <BorderBottomIcon /> <div>Bottom Border</div>
          </DropdownMenuCheckboxItem>
          <DropdownMenuCheckboxItem
            checked={!!borders.left?.size}
            onCheckedChange={() => toggle('left')}
          >
            <BorderLeftIcon /> <div>Left Border</div>
          </DropdownMenuCheckboxItem>
        </DropdownMenuGroup>
        <DropdownMenuGroup>
          <DropdownMenuCheckboxItem
            checked={!!hasNone}
            onCheckedChange={() => setAll(0)}
          >
            <BorderNoneIcon /> <div>No Border</div>
          </DropdownMenuCheckboxItem>
          <DropdownMenuCheckboxItem
            checked={!!hasAll}
            onCheckedChange={() => setAll(1)}
          >
            <BorderAllIcon /> <div>All Borders</div>
          </DropdownMenuCheckboxItem>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function MarkdownCellVerticalAlignDropdownMenu() {
  const [open, setOpen] = React.useState(false);
  const editor = useEditorRef();

  const set = React.useCallback(
    (vAlign: 'top' | 'middle' | 'bottom') => {
      setOpen(false);
      const entry = findMarkdownCell(editor);
      if (!entry) return;
      editor.tf.setNodes({ verticalAlign: vAlign }, { at: entry[1] });
    },
    [editor]
  );

  return (
    <DropdownMenu modal={false} onOpenChange={setOpen} open={open}>
      <DropdownMenuTrigger asChild>
        <ToolbarButton tooltip="Vertical align">
          <AlignVerticalDistributeCenterIcon />
        </ToolbarButton>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        <DropdownMenuGroup>
          <DropdownMenuItem className="p-2" onClick={() => set('top')}>
            <AlignVerticalJustifyStartIcon /> <span>Align Top</span>
          </DropdownMenuItem>
          <DropdownMenuItem className="p-2" onClick={() => set('middle')}>
            <AlignVerticalDistributeCenterIcon /> <span>Align Middle</span>
          </DropdownMenuItem>
          <DropdownMenuItem className="p-2" onClick={() => set('bottom')}>
            <AlignVerticalJustifyEndIcon /> <span>Align Bottom</span>
          </DropdownMenuItem>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function MarkdownCellHorizontalAlignDropdownMenu() {
  const [open, setOpen] = React.useState(false);
  const editor = useEditorRef();

  const set = React.useCallback(
    (hAlign: 'left' | 'center' | 'right') => {
      setOpen(false);
      const entry = findMarkdownCell(editor);
      if (!entry) return;
      editor.tf.setNodes({ align: hAlign }, { at: entry[1] });
    },
    [editor]
  );

  return (
    <DropdownMenu modal={false} onOpenChange={setOpen} open={open}>
      <DropdownMenuTrigger asChild>
        <ToolbarButton tooltip="Horizontal align">
          <AlignCenterIcon />
        </ToolbarButton>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        <DropdownMenuGroup>
          <DropdownMenuItem className="p-2" onClick={() => set('left')}>
            <AlignLeftIcon /> <span>Align Left</span>
          </DropdownMenuItem>
          <DropdownMenuItem className="p-2" onClick={() => set('center')}>
            <AlignCenterIcon /> <span>Align Center</span>
          </DropdownMenuItem>
          <DropdownMenuItem className="p-2" onClick={() => set('right')}>
            <AlignRightIcon /> <span>Align Right</span>
          </DropdownMenuItem>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

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
          {collapsedInside && (
            <ToolbarGroup>
              <MarkdownCellColorDropdownMenu />
              <MarkdownCellBordersDropdownMenu />
              <MarkdownCellVerticalAlignDropdownMenu />
              <MarkdownCellHorizontalAlignDropdownMenu />
            </ToolbarGroup>
          )}

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

          {collapsedInside && (
            <ToolbarGroup className="ml-auto">
              <ConvertMarkdownTableToHtmlButton />
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
  const borders = (element as any).borders || getDefaultCellBorders();
  const verticalAlign = (element as any).verticalAlign as string | undefined;
  const align = (element as any).align as string | undefined;

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
        borders.top?.size && 'before:border-t before:border-t-border',
        borders.right?.size && 'before:border-r before:border-r-border',
        borders.bottom?.size && 'before:border-b before:border-b-border',
        borders.left?.size && 'before:border-l before:border-l-border',
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
      <div
        className={cn(
          'relative z-20 box-border h-full px-3 py-2 flex flex-col',
          verticalAlign === 'middle' && 'justify-center',
          verticalAlign === 'bottom' && 'justify-end',
          (!verticalAlign || verticalAlign === 'top') && 'justify-start',
          align === 'center' && 'text-center',
          align === 'right' && 'text-right',
          (!align || align === 'left') && 'text-left',
        )}
      >
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
