'use client';

import {
  TableCellHeaderPlugin,
  TableCellPlugin,
  TablePlugin,
  TableRowPlugin,
  onKeyDownTable,
} from '@platejs/table/react';
import { KEYS } from 'platejs';

import {
  TableCellElement,
  TableCellHeaderElement,
  TableElement,
  TableRowElement,
} from '@/components/plate-ui/table-node';

const TABLE_CELL_TYPES = [KEYS.td, KEYS.th];

function isInsideMarkdownTableCell(editor: any): boolean {
  if (!editor.selection) return false;
  const entry = editor.api.node({
    match: { type: TABLE_CELL_TYPES },
    at: editor.selection,
  } as any);
  return !!entry;
}

function tableKeyDown(props: { editor: any; event: React.KeyboardEvent }) {
  if (props.event.key === 'Enter' && !props.event.ctrlKey && !props.event.metaKey) {
    if (isInsideMarkdownTableCell(props.editor)) {
      props.event.preventDefault();
      props.event.stopPropagation();
      if (props.event.shiftKey) {
        props.editor.tf.insertText('\n');
      } else {
        props.editor.tf.splitNodes({ always: true });
      }
      return;
    }
  }
  onKeyDownTable(props);
}

export const TableKit = [
  TablePlugin.configure({
    handlers: { onKeyDown: tableKeyDown },
  }).withComponent(TableElement),
  TableRowPlugin.withComponent(TableRowElement),
  TableCellPlugin.withComponent(TableCellElement),
  TableCellHeaderPlugin.withComponent(TableCellHeaderElement),
];
