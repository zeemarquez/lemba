import { BaseTablePlugin } from '@platejs/table';

import type { TTableCellElement, TTableElement } from 'platejs';
import type { SlateElementProps } from 'platejs/static';
import { SlateElement } from 'platejs/static';
import type * as React from 'react';

import { cn } from '@/lib/utils';
import { useStore, type AppState } from '@/lib/store';

export function TableElementStatic({
  children,
  ...props
}: SlateElementProps<TTableElement>) {
  const { disableMarginLeft } = props.editor.getOptions(BaseTablePlugin);
  const marginLeft = disableMarginLeft ? 0 : props.element.marginLeft;

  // Get table width constraints from the selected template
  const template = useStore((state: AppState) => state.templates.find((t: any) => t.id === state.activeTemplateId) || state.templates[0]);
  const tableSettings = template?.settings.tables;
  const maxWidth = tableSettings?.maxWidth ?? 100;
  const minWidth = tableSettings?.minWidth ?? 0;
  const alignment = tableSettings?.alignment || 'center';
  const equalWidth = !!tableSettings?.equalWidthColumns;

  return (
    <SlateElement
      {...props}
      className={cn(
        'overflow-x-auto py-5 relative',
        alignment === 'center' && 'flex justify-center',
        alignment === 'right' && 'flex justify-end'
      )}
      style={{ paddingLeft: marginLeft }}
    >
      <div
        className="group/table relative"
        style={{
          maxWidth: maxWidth < 100 ? `${maxWidth}%` : '100%',
          minWidth: minWidth > 0 ? `${minWidth}%` : 'none',
          width: equalWidth ? '100%' : 'fit-content'
        }}
      >
        <table
          className={cn(
            "mr-0 ml-px table border-collapse",
            equalWidth ? "table-fixed w-full" : "table-auto w-full min-w-full"
          )}
        >
          <tbody className="min-w-full">{children}</tbody>
        </table>
      </div>
    </SlateElement>
  );
}

export function TableRowElementStatic(props: SlateElementProps) {
  return (
    <SlateElement {...props} as="tr" className="h-full">
      {props.children}
    </SlateElement>
  );
}

export function TableCellElementStatic({
  isHeader,
  ...props
}: SlateElementProps<TTableCellElement> & {
  isHeader?: boolean;
}) {
  const { editor, element } = props;
  const { api } = editor.getPlugin(BaseTablePlugin);

  const { minHeight, width } = api.table.getCellSize({ element });
  const borders = api.table.getCellBorders({ element });

  return (
    <SlateElement
      {...props}
      as={isHeader ? 'th' : 'td'}
      attributes={{
        ...props.attributes,
        colSpan: api.table.getColSpan(element),
        rowSpan: api.table.getRowSpan(element),
      }}
      className={cn(
        'h-full overflow-visible border-none bg-background p-0',
        element.background ? 'bg-(--cellBackground)' : 'bg-background',
        isHeader && 'text-left font-normal *:m-0',
        'before:size-full',
        "before:absolute before:box-border before:select-none before:content-['']",
        borders &&
        cn(
          borders.bottom?.size && 'before:border-b before:border-b-border',
          borders.right?.size && 'before:border-r before:border-r-border',
          borders.left?.size && 'before:border-l before:border-l-border',
          borders.top?.size && 'before:border-t before:border-t-border'
        )
      )}
      style={
        {
          '--cellBackground': element.background,
          maxWidth: width || 240,
          minWidth: width || 120,
        } as React.CSSProperties
      }
    >
      <div
        className="relative z-20 box-border h-full px-4 py-2"
        style={{ minHeight }}
      >
        {props.children}
      </div>
    </SlateElement>
  );
}

export function TableCellHeaderElementStatic(
  props: SlateElementProps<TTableCellElement>
) {
  return <TableCellElementStatic {...props} isHeader />;
}
