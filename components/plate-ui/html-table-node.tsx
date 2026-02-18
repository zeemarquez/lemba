'use client';

import {
  ELEMENT_HTML_TABLE,
  ELEMENT_HTML_TABLE_ROW,
  ELEMENT_HTML_TABLE_CELL,
  ELEMENT_HTML_TABLE_HEADER_CELL,
} from '@/components/plate-editor/plugins/html-table-plugin';
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
  Code2Icon,
  EraserIcon,
  Grid2X2Icon,
  PaintBucketIcon,
  Trash2Icon,
  XIcon,
} from 'lucide-react';
import type { TElement } from 'platejs';
import {
  PlateElement,
  type PlateElementProps,
  useEditorRef,
  useEditorSelector,
  useElement,
  useFocusedLast,
  useReadOnly,
  useRemoveNodeButton,
  useSelected,
} from 'platejs/react';
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

// ---------------------------------------------------------------------------
// Helpers for HTML table row/column transforms
// ---------------------------------------------------------------------------

const HTML_TABLE_CELL_TYPES = [ELEMENT_HTML_TABLE_CELL, ELEMENT_HTML_TABLE_HEADER_CELL];

function findNode(editor: any, type: string | string[]) {
  if (!editor.selection) return null;
  return editor.api.node({
    match: { type },
    at: editor.selection,
  } as any) as [TElement, number[]] | undefined;
}

function insertHtmlTableRow(editor: any, opts: { before?: boolean } = {}) {
  const rowEntry = findNode(editor, ELEMENT_HTML_TABLE_ROW);
  if (!rowEntry) return;

  const [row, rowPath] = rowEntry;
  const numCells = row.children.length;

  const newRow = {
    type: ELEMENT_HTML_TABLE_ROW,
    children: Array.from({ length: numCells }, () => ({
      type: ELEMENT_HTML_TABLE_CELL,
      children: [{ type: 'p', children: [{ text: '' }] }],
    })),
  };

  const idx = rowPath[rowPath.length - 1];
  const at = [...rowPath.slice(0, -1), opts.before ? idx : idx + 1];
  editor.tf.insertNodes(newRow, { at });
}

function deleteHtmlTableRow(editor: any) {
  const tableEntry = findNode(editor, ELEMENT_HTML_TABLE);
  const rowEntry = findNode(editor, ELEMENT_HTML_TABLE_ROW);
  if (!tableEntry || !rowEntry) return;
  if (tableEntry[0].children.length <= 1) return;
  editor.tf.removeNodes({ at: rowEntry[1] });
}

function insertHtmlTableColumn(editor: any, opts: { before?: boolean } = {}) {
  const tableEntry = findNode(editor, ELEMENT_HTML_TABLE);
  const cellEntry = findNode(editor, HTML_TABLE_CELL_TYPES);
  if (!tableEntry || !cellEntry) return;

  const [, cellPath] = cellEntry;
  const colIndex = cellPath[cellPath.length - 1];
  const insertIndex = opts.before ? colIndex : colIndex + 1;

  const [table, tablePath] = tableEntry;

  for (let i = table.children.length - 1; i >= 0; i--) {
    const row = table.children[i] as TElement;
    const isHeaderRow = row.children.every(
      (c: any) => c.type === ELEMENT_HTML_TABLE_HEADER_CELL
    );
    const newCell = {
      type: isHeaderRow ? ELEMENT_HTML_TABLE_HEADER_CELL : ELEMENT_HTML_TABLE_CELL,
      children: [{ type: 'p', children: [{ text: '' }] }],
    };
    editor.tf.insertNodes(newCell, { at: [...tablePath, i, insertIndex] });
  }
}

function deleteHtmlTableColumn(editor: any) {
  const tableEntry = findNode(editor, ELEMENT_HTML_TABLE);
  const cellEntry = findNode(editor, HTML_TABLE_CELL_TYPES);
  if (!tableEntry || !cellEntry) return;

  const [, cellPath] = cellEntry;
  const colIndex = cellPath[cellPath.length - 1];

  const [table, tablePath] = tableEntry;
  const firstRow = table.children[0] as TElement;
  if (firstRow.children.length <= 1) return;

  for (let i = table.children.length - 1; i >= 0; i--) {
    editor.tf.removeNodes({ at: [...tablePath, i, colIndex] });
  }
}

// ---------------------------------------------------------------------------
// HtmlTableElement
// ---------------------------------------------------------------------------

export function HtmlTableElement({
  children,
  ...props
}: PlateElementProps<TElement>) {
  const readOnly = useReadOnly();

  const content = (
    <PlateElement
      {...props}
      className={cn('overflow-x-auto py-5 relative')}
      style={{ width: undefined, minWidth: undefined, maxWidth: undefined }}
    >
      <div className="group/table relative h-full w-full">
        <div
          className={cn(
            'inline-flex items-center gap-1 px-1.5 py-0.5 mb-0.5 rounded text-[10px] font-medium uppercase tracking-wider select-none',
            'bg-muted text-muted-foreground'
          )}
          contentEditable={false}
        >
          <Code2Icon className="size-3" />
          HTML Table
        </div>

        <table className="mr-0 table border-collapse table-auto w-full">
          <tbody className="min-w-full">{children}</tbody>
        </table>
      </div>
    </PlateElement>
  );

  if (readOnly) return content;

  return <HtmlTableFloatingToolbar>{content}</HtmlTableFloatingToolbar>;
}

// ---------------------------------------------------------------------------
// Floating toolbar
// ---------------------------------------------------------------------------

function HtmlTableFloatingToolbar({
  children,
  ...props
}: React.ComponentProps<typeof PopoverContent>) {
  const editor = useEditorRef();
  const selected = useSelected();
  const element = useElement<TElement>();
  const { props: buttonProps } = useRemoveNodeButton({ element });
  const isFocusedLast = useFocusedLast();

  const collapsedInside = useEditorSelector(
    (ed) => selected && ed.api.isCollapsed(),
    [selected]
  );

  return (
    <Popover modal={false} open={isFocusedLast && !!collapsedInside}>
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
            <HtmlCellColorDropdownMenu tooltip="Background color">
              <PaintBucketIcon />
            </HtmlCellColorDropdownMenu>

            <HtmlCellBordersDropdownMenu />

            <HtmlCellVerticalAlignDropdownMenu tooltip="Vertical align">
              <AlignVerticalDistributeCenterIcon />
            </HtmlCellVerticalAlignDropdownMenu>

            <HtmlCellHorizontalAlignDropdownMenu tooltip="Horizontal align">
              <AlignCenterIcon />
            </HtmlCellHorizontalAlignDropdownMenu>

            <ToolbarButton tooltip="Delete table" {...buttonProps}>
              <Trash2Icon />
            </ToolbarButton>
          </ToolbarGroup>

          <ToolbarGroup>
            <ToolbarButton
              onClick={() => insertHtmlTableRow(editor, { before: true })}
              onMouseDown={(e) => e.preventDefault()}
              tooltip="Insert row before"
            >
              <ArrowUp />
            </ToolbarButton>
            <ToolbarButton
              onClick={() => insertHtmlTableRow(editor)}
              onMouseDown={(e) => e.preventDefault()}
              tooltip="Insert row after"
            >
              <ArrowDown />
            </ToolbarButton>
            <ToolbarButton
              onClick={() => deleteHtmlTableRow(editor)}
              onMouseDown={(e) => e.preventDefault()}
              tooltip="Delete row"
            >
              <XIcon />
            </ToolbarButton>
          </ToolbarGroup>

          <ToolbarGroup>
            <ToolbarButton
              onClick={() => insertHtmlTableColumn(editor, { before: true })}
              onMouseDown={(e) => e.preventDefault()}
              tooltip="Insert column before"
            >
              <ArrowLeft />
            </ToolbarButton>
            <ToolbarButton
              onClick={() => insertHtmlTableColumn(editor)}
              onMouseDown={(e) => e.preventDefault()}
              tooltip="Insert column after"
            >
              <ArrowRight />
            </ToolbarButton>
            <ToolbarButton
              onClick={() => deleteHtmlTableColumn(editor)}
              onMouseDown={(e) => e.preventDefault()}
              tooltip="Delete column"
            >
              <XIcon />
            </ToolbarButton>
          </ToolbarGroup>
        </Toolbar>
      </PopoverContent>
    </Popover>
  );
}

// ---------------------------------------------------------------------------
// Background color
// ---------------------------------------------------------------------------

function HtmlCellColorDropdownMenu({
  children,
  tooltip,
}: {
  children: React.ReactNode;
  tooltip: string;
}) {
  const [open, setOpen] = React.useState(false);
  const editor = useEditorRef();

  const apply = React.useCallback(
    (color: string | null) => {
      setOpen(false);
      const entry = findNode(editor, HTML_TABLE_CELL_TYPES);
      if (!entry) return;
      editor.tf.setNodes({ background: color }, { at: entry[1] });
    },
    [editor]
  );

  return (
    <DropdownMenu modal={false} onOpenChange={setOpen} open={open}>
      <DropdownMenuTrigger asChild>
        <ToolbarButton tooltip={tooltip}>{children}</ToolbarButton>
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

// ---------------------------------------------------------------------------
// Borders
// ---------------------------------------------------------------------------

function getDefaultBorders() {
  return {
    top: { size: 1 },
    right: { size: 1 },
    bottom: { size: 1 },
    left: { size: 1 },
  };
}

function HtmlCellBordersDropdownMenu() {
  const editor = useEditorRef();

  const borders = useEditorSelector((ed) => {
    if (!ed.selection) return getDefaultBorders();
    const entry = findNode(ed, HTML_TABLE_CELL_TYPES);
    if (!entry) return getDefaultBorders();
    return (entry[0] as any).borders || getDefaultBorders();
  }, []);

  const toggle = React.useCallback(
    (side: 'top' | 'right' | 'bottom' | 'left') => {
      const entry = findNode(editor, HTML_TABLE_CELL_TYPES);
      if (!entry) return;
      const current = (entry[0] as any).borders || getDefaultBorders();
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
      const entry = findNode(editor, HTML_TABLE_CELL_TYPES);
      if (!entry) return;
      const b = { top: { size }, right: { size }, bottom: { size }, left: { size } };
      editor.tf.setNodes({ borders: b }, { at: entry[1] });
    },
    [editor]
  );

  const hasAll = borders.top?.size && borders.right?.size && borders.bottom?.size && borders.left?.size;
  const hasNone = !borders.top?.size && !borders.right?.size && !borders.bottom?.size && !borders.left?.size;

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
          <DropdownMenuCheckboxItem checked={!!borders.top?.size} onCheckedChange={() => toggle('top')}>
            <BorderTopIcon /> <div>Top Border</div>
          </DropdownMenuCheckboxItem>
          <DropdownMenuCheckboxItem checked={!!borders.right?.size} onCheckedChange={() => toggle('right')}>
            <BorderRightIcon /> <div>Right Border</div>
          </DropdownMenuCheckboxItem>
          <DropdownMenuCheckboxItem checked={!!borders.bottom?.size} onCheckedChange={() => toggle('bottom')}>
            <BorderBottomIcon /> <div>Bottom Border</div>
          </DropdownMenuCheckboxItem>
          <DropdownMenuCheckboxItem checked={!!borders.left?.size} onCheckedChange={() => toggle('left')}>
            <BorderLeftIcon /> <div>Left Border</div>
          </DropdownMenuCheckboxItem>
        </DropdownMenuGroup>
        <DropdownMenuGroup>
          <DropdownMenuCheckboxItem checked={!!hasNone} onCheckedChange={() => setAll(0)}>
            <BorderNoneIcon /> <div>No Border</div>
          </DropdownMenuCheckboxItem>
          <DropdownMenuCheckboxItem checked={!!hasAll} onCheckedChange={() => setAll(1)}>
            <BorderAllIcon /> <div>All Borders</div>
          </DropdownMenuCheckboxItem>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

// ---------------------------------------------------------------------------
// Vertical align
// ---------------------------------------------------------------------------

function HtmlCellVerticalAlignDropdownMenu({
  children,
  tooltip,
}: {
  children: React.ReactNode;
  tooltip: string;
}) {
  const [open, setOpen] = React.useState(false);
  const editor = useEditorRef();

  const set = React.useCallback(
    (vAlign: 'top' | 'middle' | 'bottom') => {
      setOpen(false);
      const entry = findNode(editor, HTML_TABLE_CELL_TYPES);
      if (!entry) return;
      editor.tf.setNodes({ verticalAlign: vAlign }, { at: entry[1] });
    },
    [editor]
  );

  return (
    <DropdownMenu modal={false} onOpenChange={setOpen} open={open}>
      <DropdownMenuTrigger asChild>
        <ToolbarButton tooltip={tooltip}>{children}</ToolbarButton>
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

// ---------------------------------------------------------------------------
// Horizontal align
// ---------------------------------------------------------------------------

function HtmlCellHorizontalAlignDropdownMenu({
  children,
  tooltip,
}: {
  children: React.ReactNode;
  tooltip: string;
}) {
  const [open, setOpen] = React.useState(false);
  const editor = useEditorRef();

  const set = React.useCallback(
    (hAlign: 'left' | 'center' | 'right') => {
      setOpen(false);
      const entry = findNode(editor, HTML_TABLE_CELL_TYPES);
      if (!entry) return;
      editor.tf.setNodes({ align: hAlign }, { at: entry[1] });
    },
    [editor]
  );

  return (
    <DropdownMenu modal={false} onOpenChange={setOpen} open={open}>
      <DropdownMenuTrigger asChild>
        <ToolbarButton tooltip={tooltip}>{children}</ToolbarButton>
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

// ---------------------------------------------------------------------------
// HtmlTableRowElement
// ---------------------------------------------------------------------------

export function HtmlTableRowElement({
  children,
  ...props
}: PlateElementProps<TElement>) {
  return (
    <PlateElement {...props} as="tr" className="group/row">
      {children}
    </PlateElement>
  );
}

// ---------------------------------------------------------------------------
// HtmlTableCellElement (used for both td and th)
// ---------------------------------------------------------------------------

export function HtmlTableCellElement({
  children,
  ...props
}: PlateElementProps<TElement>) {
  const element = props.element;
  const isHeader = element.type === ELEMENT_HTML_TABLE_HEADER_CELL;
  const colSpan = (element as any).colSpan as number | undefined;
  const rowSpan = (element as any).rowSpan as number | undefined;
  const background = (element as any).background as string | undefined;
  const verticalAlign = (element as any).verticalAlign as string | undefined;
  const align = (element as any).align as string | undefined;

  const borders = (element as any).borders || getDefaultBorders();

  return (
    <PlateElement
      {...props}
      as={isHeader ? 'th' : 'td'}
      attributes={{
        ...props.attributes,
        ...(colSpan && colSpan > 1 ? { colSpan } : {}),
        ...(rowSpan && rowSpan > 1 ? { rowSpan } : {}),
      }}
      className={cn(
        'relative align-top h-full overflow-visible border-none p-0',
        background ? 'bg-(--cellBackground)' : 'bg-background',
        isHeader && 'text-left *:m-0',
        'before:inset-0 before:size-full',
        "before:absolute before:box-border before:select-none before:content-['']",
        borders.bottom?.size && 'before:border-b before:border-b-border',
        borders.right?.size && 'before:border-r before:border-r-border',
        borders.left?.size && 'before:border-l before:border-l-border',
        borders.top?.size && 'before:border-t before:border-t-border'
      )}
      style={
        {
          '--cellBackground': background,
          minWidth: 120,
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
          (!align || align === 'left') && 'text-left'
        )}
      >
        {children}
      </div>
    </PlateElement>
  );
}
