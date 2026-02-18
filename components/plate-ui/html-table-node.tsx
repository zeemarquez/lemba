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
// Column resizing (percentages), colgroup, and resizer handles
// ---------------------------------------------------------------------------

function getColumnCount(element: TElement): number {
  const firstRow = element.children?.[0] as TElement | undefined;
  if (!firstRow?.children?.length) return 0;
  return (firstRow.children as TElement[]).reduce(
    (sum, c) => sum + (Math.max(1, (c as any).colSpan ?? 1)),
    0
  );
}

function normalizePercentWidths(widths: number[], minPct = 5): number[] {
  const n = widths.length;
  if (n === 0) return [];
  let arr = widths.map((w) => Math.max(minPct, Math.min(100, w)));
  const total = arr.reduce((a, b) => a + b, 0);
  if (total !== 100) arr = arr.map((w) => (w / total) * 100);
  return arr;
}

// ---------------------------------------------------------------------------
// HtmlTableElement
// ---------------------------------------------------------------------------

export function HtmlTableElement({
  children,
  ...props
}: PlateElementProps<TElement>) {
  const readOnly = useReadOnly();
  const element = useElement<TElement>();
  const editor = useEditorRef();
  const tableRef = React.useRef<HTMLTableElement>(null);

  const numCols = getColumnCount(element);
  const storedWidths = (element as any).colWidths as number[] | undefined;
  const hasStoredWidths = Array.isArray(storedWidths) && storedWidths.length === numCols;

  const [dragState, setDragState] = React.useState<{
    resizerIndex: number;
    startX: number;
    startWidths: number[];
    currentX: number;
  } | null>(null);

  const currentWidths = React.useMemo(() => {
    if (!dragState || !tableRef.current) {
      return hasStoredWidths ? storedWidths : numCols > 0 ? Array(numCols).fill(100 / numCols) : [];
    }
    const { resizerIndex, startX, startWidths, currentX } = dragState;
    const tableWidth = tableRef.current.getBoundingClientRect().width;
    if (tableWidth <= 0) return startWidths;
    const deltaPct = ((currentX - startX) / tableWidth) * 100;
    const next = [...startWidths];
    next[resizerIndex] = next[resizerIndex] + deltaPct;
    next[resizerIndex + 1] = next[resizerIndex + 1] - deltaPct;
    return normalizePercentWidths(next);
  }, [dragState, hasStoredWidths, storedWidths, numCols]);

  const currentWidthsRef = React.useRef<number[]>(currentWidths);
  currentWidthsRef.current = currentWidths;

  React.useEffect(() => {
    if (dragState === null) return;
    const onMove = (e: MouseEvent) => {
      setDragState((prev) => (prev ? { ...prev, currentX: e.clientX } : null));
    };
    const onUp = () => {
      const tablePath = editor.api.findPath(element);
      const widths = currentWidthsRef.current;
      if (tablePath && widths.length === numCols) {
        editor.tf.setNodes({ colWidths: widths }, { at: tablePath });
      }
      setDragState(null);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [dragState !== null, editor, element, numCols]);

  const startResize = React.useCallback(
    (resizerIndex: number, clientX: number) => {
      if (readOnly || resizerIndex < 0 || resizerIndex >= numCols - 1) return;
      const startWidths =
        (hasStoredWidths ? storedWidths : Array(numCols).fill(100 / numCols)) as number[];
      setDragState({ resizerIndex, startX: clientX, startWidths, currentX: clientX });
    },
    [readOnly, numCols, hasStoredWidths, storedWidths]
  );

  const showColgroup =
    (hasStoredWidths || dragState !== null) && currentWidths.length === numCols && numCols > 0;
  const tableLayout = showColgroup ? 'fixed' : undefined;

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

        <div className="relative min-h-[2rem]">
          <table
            ref={tableRef}
            className="mr-0 table border-collapse w-full relative"
            style={{
              tableLayout: tableLayout ?? 'auto',
            }}
          >
            {showColgroup && (
              <colgroup>
                {currentWidths.map((pct, i) => (
                  <col key={i} style={{ width: `${pct}%` }} />
                ))}
              </colgroup>
            )}
            <tbody className="min-w-full">{children}</tbody>
          </table>

          {!readOnly && numCols > 1 && (
            <div
              className="absolute inset-0 z-20"
              style={{ pointerEvents: 'none' }}
              aria-hidden
            >
              {Array.from({ length: numCols - 1 }).map((_, i) => {
                const leftPct = currentWidths
                  .slice(0, i + 1)
                  .reduce((a, b) => a + b, 0);
                return (
                  <div
                    key={i}
                    className="absolute top-0 bottom-0 w-1.5 -ml-[3px] cursor-col-resize border-l border-transparent hover:border-primary/60 hover:bg-primary/20 min-w-[6px]"
                    style={{
                      left: `${leftPct}%`,
                      pointerEvents: 'auto',
                    }}
                    onMouseDown={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      startResize(i, e.clientX);
                    }}
                    contentEditable={false}
                    data-table-resizer
                  />
                );
              })}
            </div>
          )}
        </div>
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
