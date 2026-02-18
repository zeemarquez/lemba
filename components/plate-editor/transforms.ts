'use client';

import { insertCodeBlock, toggleCodeBlock } from '@platejs/code-block';
import { insertDate } from '@platejs/date';
import { insertExcalidraw } from '@platejs/excalidraw';
import { insertColumnGroup, toggleColumnGroup } from '@platejs/layout';
import { triggerFloatingLink } from '@platejs/link/react';
import { insertEquation, insertInlineEquation } from '@platejs/math';
import {
  insertAudioPlaceholder,
  insertFilePlaceholder,
  insertMedia,
  insertVideoPlaceholder,
} from '@platejs/media';
import { SuggestionPlugin } from '@platejs/suggestion/react';
import { TablePlugin } from '@platejs/table/react';
import { ELEMENT_HTML_TABLE, ELEMENT_HTML_TABLE_ROW, ELEMENT_HTML_TABLE_CELL, ELEMENT_HTML_TABLE_HEADER_CELL } from '@/components/plate-editor/plugins/html-table-plugin';
import { insertToc } from '@platejs/toc';
import {
  KEYS,
  type NodeEntry,
  type Path,
  PathApi,
  type TElement,
  NodeApi,
} from 'platejs';
import type { PlateEditor } from 'platejs/react';

export const getNextFigureId = (editor: PlateEditor) => {
  const images = editor.api.nodes({
    at: [],
    match: (n) => n.type === KEYS.img,
  });

  const ids = new Set(
    Array.from(images)
      .map(([node]) => (node as any).id)
      .filter(Boolean)
  );
  
  let index = 1;
  while (ids.has(`fig-${index}`)) {
    index++;
  }
  
  return `fig-${index}`;
};

export const isFigureIdUnique = (editor: PlateEditor, id: string, excludePath?: Path) => {
  const images = editor.api.nodes({
    at: [],
    match: (n, path) => n.type === KEYS.img && (!excludePath || !PathApi.equals(path, excludePath)),
  });

  return !Array.from(images).some(([node]) => (node as any).id === id);
};

const ACTION_THREE_COLUMNS = 'action_three_columns';

const insertList = (editor: PlateEditor, type: string) => {
  editor.tf.insertNodes(
    editor.api.create.block({
      indent: 1,
      listStyleType: type,
    }),
    { select: true }
  );
};

const insertBlockMap: Record<
  string,
  (editor: PlateEditor, type: string) => void
> = {
  [KEYS.listTodo]: insertList,
  [KEYS.ol]: insertList,
  [KEYS.ul]: insertList,
  [ACTION_THREE_COLUMNS]: (editor) =>
    insertColumnGroup(editor, { columns: 3, select: true }),
  [KEYS.audio]: (editor) => insertAudioPlaceholder(editor, { select: true }),
  [KEYS.callout]: (editor) => {
    // Insert callout with default NOTE (lucide-info) type
    editor.tf.insertNodes({
      type: KEYS.callout,
      icon: 'lucide:info',
      backgroundColor: 'hsla(210, 100%, 50%, 0.1)',
      children: [{ type: 'p', children: [{ text: '' }] }],
    }, { select: true });
  },
  [KEYS.codeBlock]: (editor) => insertCodeBlock(editor, { select: true }),
  [KEYS.equation]: (editor) => insertEquation(editor, { select: true }),
  [KEYS.excalidraw]: (editor) => insertExcalidraw(editor, {}, { select: true }),
  [KEYS.file]: (editor) => insertFilePlaceholder(editor, { select: true }),
  [KEYS.img]: (editor) => {
    // Insert image with auto-assigned fig-X ID
    editor.tf.insertNodes({
      type: KEYS.img,
      children: [{ text: '' }],
      id: getNextFigureId(editor),
      width: 400,
      align: 'center',
      url: '',
    }, { select: true });
  },
  [KEYS.mediaEmbed]: (editor) =>
    insertMedia(editor, {
      select: true,
      type: KEYS.mediaEmbed,
    }),
  [KEYS.table]: (editor) =>
    editor.getTransforms(TablePlugin).insert.table({}, { select: true }),
  [ELEMENT_HTML_TABLE]: (editor) => {
    const emptyCell = () => ({ type: ELEMENT_HTML_TABLE_CELL, children: [{ type: 'p', children: [{ text: '' }] }] });
    const headerCell = () => ({ type: ELEMENT_HTML_TABLE_HEADER_CELL, children: [{ type: 'p', children: [{ text: '' }] }] });
    editor.tf.insertNodes({
      type: ELEMENT_HTML_TABLE,
      children: [
        { type: ELEMENT_HTML_TABLE_ROW, children: [headerCell(), headerCell(), headerCell()] },
        { type: ELEMENT_HTML_TABLE_ROW, children: [emptyCell(), emptyCell(), emptyCell()] },
      ],
    }, { select: true });
  },
  [KEYS.toc]: (editor) => insertToc(editor, { select: true }),
  [KEYS.video]: (editor) => insertVideoPlaceholder(editor, { select: true }),
};

const insertInlineMap: Record<
  string,
  (editor: PlateEditor, type: string) => void
> = {
  [KEYS.date]: (editor) => insertDate(editor, { select: true }),
  [KEYS.inlineEquation]: (editor) =>
    insertInlineEquation(editor, '', { select: true }),
  [KEYS.link]: (editor) => triggerFloatingLink(editor, { focused: true }),
};

type InsertBlockOptions = {
  upsert?: boolean;
};

export const insertBlock = (
  editor: PlateEditor,
  type: string,
  options: InsertBlockOptions = {}
) => {
  const { upsert = false } = options;

  editor.tf.withoutNormalizing(() => {
    const block = editor.api.block();

    if (!block) return;

    const [currentNode, path] = block;
    const isCurrentBlockEmpty = editor.api.isEmpty(currentNode);
    const currentBlockType = getBlockType(currentNode);

    const isSameBlockType = type === currentBlockType;

    if (upsert && isCurrentBlockEmpty && isSameBlockType) {
      return;
    }

    if (type in insertBlockMap) {
      insertBlockMap[type](editor, type);
    } else {
      editor.tf.insertNodes(editor.api.create.block({ type }), {
        at: PathApi.next(path),
        select: true,
      });
    }

    if (!isSameBlockType) {
      editor.getApi(SuggestionPlugin).suggestion.withoutSuggestions(() => {
        editor.tf.removeNodes({ previousEmptyBlock: true });
      });
    }
  });
};

export const insertInlineElement = (editor: PlateEditor, type: string) => {
  if (insertInlineMap[type]) {
    insertInlineMap[type](editor, type);
  }
};

const setList = (
  editor: PlateEditor,
  type: string,
  entry: NodeEntry<TElement>
) => {
  editor.tf.setNodes(
    editor.api.create.block({
      indent: 1,
      listStyleType: type,
    }),
    {
      at: entry[1],
    }
  );
};

const setBlockMap: Record<
  string,
  (editor: PlateEditor, type: string, entry: NodeEntry<TElement>) => void
> = {
  [KEYS.listTodo]: setList,
  [KEYS.ol]: setList,
  [KEYS.ul]: setList,
  [ACTION_THREE_COLUMNS]: (editor) => toggleColumnGroup(editor, { columns: 3 }),
  [KEYS.codeBlock]: (editor) => toggleCodeBlock(editor),
};

export const setBlockType = (
  editor: PlateEditor,
  type: string,
  { at }: { at?: Path } = {}
) => {
  editor.tf.withoutNormalizing(() => {
    const setEntry = (entry: NodeEntry<TElement>) => {
      const [node, path] = entry;

      if (node[KEYS.listType]) {
        editor.tf.unsetNodes([KEYS.listType, 'indent'], { at: path });
      }
      if (type in setBlockMap) {
        return setBlockMap[type](editor, type, entry);
      }
      if (node.type !== type) {
        editor.tf.setNodes({ type }, { at: path });
      }
    };

    if (at) {
      const entry = editor.api.node<TElement>(at);

      if (entry) {
        setEntry(entry);

        return;
      }
    }

    const entries = editor.api.blocks({ mode: 'lowest' });

    entries.forEach((entry) => {
      setEntry(entry);
    });
  });
};

export const getBlockType = (block: TElement) => {
  if (block[KEYS.listType]) {
    if (block[KEYS.listType] === KEYS.ol) {
      return KEYS.ol;
    }
    if (block[KEYS.listType] === KEYS.listTodo) {
      return KEYS.listTodo;
    }
    return KEYS.ul;
  }

  return block.type;
};
