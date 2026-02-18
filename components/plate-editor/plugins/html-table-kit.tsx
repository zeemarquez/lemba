'use client';

import {
  HtmlTablePlugin,
  HtmlTableRowPlugin,
  HtmlTableCellPlugin,
  HtmlTableHeaderCellPlugin,
} from './html-table-plugin';

import {
  HtmlTableElement,
  HtmlTableRowElement,
  HtmlTableCellElement,
} from '@/components/plate-ui/html-table-node';

export const HtmlTableKit = [
  HtmlTablePlugin.withComponent(HtmlTableElement),
  HtmlTableRowPlugin.withComponent(HtmlTableRowElement),
  HtmlTableCellPlugin.withComponent(HtmlTableCellElement),
  HtmlTableHeaderCellPlugin.withComponent(HtmlTableCellElement),
];
