'use client';

import { createPlatePlugin } from 'platejs/react';

export const ELEMENT_HTML_TABLE = 'html_table';
export const ELEMENT_HTML_TABLE_ROW = 'html_table_row';
export const ELEMENT_HTML_TABLE_CELL = 'html_table_cell';
export const ELEMENT_HTML_TABLE_HEADER_CELL = 'html_table_header_cell';

const HTML_CELL_TYPES = [ELEMENT_HTML_TABLE_CELL, ELEMENT_HTML_TABLE_HEADER_CELL];

function isInsideHtmlTableCell(editor: any): boolean {
  if (!editor.selection) return false;
  const entry = editor.api.node({
    match: { type: HTML_CELL_TYPES },
    at: editor.selection,
  } as any);
  return !!entry;
}

export const HtmlTablePlugin = createPlatePlugin({
  key: ELEMENT_HTML_TABLE,
  node: {
    isElement: true,
  },
  handlers: {
    onKeyDown: ({ editor, event }) => {
      if (event.key === 'Enter' && !event.ctrlKey && !event.metaKey) {
        if (!isInsideHtmlTableCell(editor)) return;

        event.preventDefault();
        event.stopPropagation();

        if (event.shiftKey) {
          editor.tf.insertText('\n');
        } else {
          editor.tf.splitNodes({ always: true });
        }
      }
    },
  },
});

export const HtmlTableRowPlugin = createPlatePlugin({
  key: ELEMENT_HTML_TABLE_ROW,
  node: {
    isElement: true,
  },
});

export const HtmlTableCellPlugin = createPlatePlugin({
  key: ELEMENT_HTML_TABLE_CELL,
  node: {
    isElement: true,
  },
});

export const HtmlTableHeaderCellPlugin = createPlatePlugin({
  key: ELEMENT_HTML_TABLE_HEADER_CELL,
  node: {
    isElement: true,
  },
});
