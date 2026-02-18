import { cn } from '@/lib/utils';
import {
  ELEMENT_HTML_TABLE_HEADER_CELL,
} from '@/components/plate-editor/plugins/html-table-plugin';
import type { TElement } from 'platejs';
import type { SlateElementProps } from 'platejs/static';
import { SlateElement } from 'platejs/static';

export function HtmlTableElementStatic({
  children,
  ...props
}: SlateElementProps<TElement>) {
  return (
    <SlateElement {...props} className="overflow-x-auto py-5 relative">
      <table className="w-full border-collapse border border-slate-300 dark:border-slate-700">
        <tbody>{children}</tbody>
      </table>
    </SlateElement>
  );
}

export function HtmlTableRowElementStatic(props: SlateElementProps) {
  return (
    <SlateElement {...props} as="tr">
      {props.children}
    </SlateElement>
  );
}

export function HtmlTableCellElementStatic({
  ...props
}: SlateElementProps<TElement>) {
  const element = props.element;
  const isHeader = element.type === ELEMENT_HTML_TABLE_HEADER_CELL;
  const colSpan = (element as any).colSpan as number | undefined;
  const rowSpan = (element as any).rowSpan as number | undefined;
  const background = (element as any).background as string | undefined;
  const verticalAlign = (element as any).verticalAlign as string | undefined;
  const align = (element as any).align as string | undefined;

  return (
    <SlateElement
      {...props}
      as={isHeader ? 'th' : 'td'}
      attributes={{
        ...props.attributes,
        ...(colSpan && colSpan > 1 ? { colSpan } : {}),
        ...(rowSpan && rowSpan > 1 ? { rowSpan } : {}),
      }}
      className={cn(
        'border border-slate-300 dark:border-slate-700 px-3 py-2 min-w-[80px]',
        isHeader && 'bg-slate-50 dark:bg-slate-800 font-semibold text-left',
        verticalAlign === 'middle' && 'align-middle',
        verticalAlign === 'bottom' && 'align-bottom',
        align === 'center' && 'text-center',
        align === 'right' && 'text-right'
      )}
      style={background ? { backgroundColor: background } : undefined}
    >
      {props.children}
    </SlateElement>
  );
}
