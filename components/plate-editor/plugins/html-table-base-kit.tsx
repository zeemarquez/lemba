import { createSlatePlugin } from 'platejs';
import {
  ELEMENT_HTML_TABLE,
  ELEMENT_HTML_TABLE_ROW,
  ELEMENT_HTML_TABLE_CELL,
  ELEMENT_HTML_TABLE_HEADER_CELL,
} from './html-table-plugin';
import {
  HtmlTableElementStatic,
  HtmlTableRowElementStatic,
  HtmlTableCellElementStatic,
} from '@/components/plate-ui/html-table-node-static';

const BaseHtmlTablePlugin = createSlatePlugin({
  key: ELEMENT_HTML_TABLE,
  node: { isElement: true },
});

const BaseHtmlTableRowPlugin = createSlatePlugin({
  key: ELEMENT_HTML_TABLE_ROW,
  node: { isElement: true },
});

const BaseHtmlTableCellPlugin = createSlatePlugin({
  key: ELEMENT_HTML_TABLE_CELL,
  node: { isElement: true },
});

const BaseHtmlTableHeaderCellPlugin = createSlatePlugin({
  key: ELEMENT_HTML_TABLE_HEADER_CELL,
  node: { isElement: true },
});

export const BaseHtmlTableKit = [
  BaseHtmlTablePlugin.withComponent(HtmlTableElementStatic),
  BaseHtmlTableRowPlugin.withComponent(HtmlTableRowElementStatic),
  BaseHtmlTableCellPlugin.withComponent(HtmlTableCellElementStatic),
  BaseHtmlTableHeaderCellPlugin.withComponent(HtmlTableCellElementStatic),
];
