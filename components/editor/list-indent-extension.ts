/**
 * CodeMirror extension: smart Tab / Shift-Tab for ordered (numbered) lists.
 *
 * When the cursor is on a line that starts with an ordered list marker
 * (`1. `, `2. `, etc.), pressing Tab increases the indent by one level and
 * pressing Shift-Tab decreases it.  After the indent change the entire
 * contiguous list block is renumbered so every level has sequential numbers
 * starting from 1.
 *
 * For non-list lines the handlers return `false` and CodeMirror falls through
 * to its default Tab behaviour (insert indent / remove indent).
 */

import { keymap, EditorView } from '@codemirror/view';
import { EditorState, Prec } from '@codemirror/state';

/** Number of spaces that equal one indent level in a markdown ordered list. */
const LIST_INDENT = 3;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface OrderedItem {
  spaces: string;
  num: number;
  content: string;
}

/** Parse an ordered list item line.  Returns null for any other line. */
function parseOrderedItem(line: string): OrderedItem | null {
  const m = line.match(/^(\s*)(\d+)[.)]\s([\s\S]*)$/);
  if (!m) return null;
  return { spaces: m[1], num: parseInt(m[2], 10), content: m[3] };
}

/** Return true if the line looks like any kind of list item. */
function isListLine(line: string): boolean {
  return /^\s*(\d+[.)]\s|[-*+]\s)/.test(line);
}

/**
 * Find the range of line numbers for the contiguous list block that contains
 * the given document position.  The block extends in both directions as long
 * as consecutive lines are list items (blank lines and non-list lines stop
 * the search).
 */
function findListBlock(
  state: EditorState,
  pos: number
): { firstLine: number; lastLine: number } {
  const anchor = state.doc.lineAt(pos);
  let first = anchor.number;
  let last = anchor.number;

  while (first > 1 && isListLine(state.doc.line(first - 1).text)) {
    first--;
  }
  while (last < state.doc.lines && isListLine(state.doc.line(last + 1).text)) {
    last++;
  }

  return { firstLine: first, lastLine: last };
}

/**
 * Renumber every ordered-list item in the supplied array of lines.
 *
 * Rules:
 * - Each item's indent level is derived from its leading spaces
 *   (floor(spaces / LIST_INDENT)).
 * - Counters are tracked per level.  When an item at level L is encountered
 *   all counters for levels > L are reset, then counter[L] is incremented
 *   and assigned as the item's new number.
 * - Unordered items and non-list lines are passed through unchanged but
 *   DO reset the counters for levels deeper than their own indent, so that
 *   a sub-ordered-list that follows an unordered item restarts at 1.
 */
function renumberBlock(lines: string[]): string[] {
  const counters = new Map<number, number>();

  return lines.map((line) => {
    const item = parseOrderedItem(line);

    if (!item) {
      // Unordered item or non-list line: reset deeper counters based on indent
      const leadingSpaces = line.match(/^(\s*)/)?.[1].length ?? 0;
      const level = Math.floor(leadingSpaces / LIST_INDENT);
      for (const k of counters.keys()) {
        if (k > level) counters.delete(k);
      }
      return line;
    }

    const level = Math.floor(item.spaces.length / LIST_INDENT);

    // Reset all counters deeper than this level
    for (const k of counters.keys()) {
      if (k > level) counters.delete(k);
    }

    const n = (counters.get(level) ?? 0) + 1;
    counters.set(level, n);

    return `${item.spaces}${n}. ${item.content}`;
  });
}

// ---------------------------------------------------------------------------
// Key handler
// ---------------------------------------------------------------------------

function handleListIndent(view: EditorView, isIndent: boolean): boolean {
  const { state } = view;
  const sel = state.selection.main;

  // Only act on a single cursor (no multi-line selection)
  if (!sel.empty) return false;

  const line = state.doc.lineAt(sel.head);
  const item = parseOrderedItem(line.text);
  if (!item) return false; // not an ordered list item → fall through

  // Can't outdent when already at the top level
  if (!isIndent && item.spaces.length < LIST_INDENT) return false;

  // Build the updated text for the current line
  const newSpaces = isIndent
    ? item.spaces + ' '.repeat(LIST_INDENT)
    : item.spaces.slice(0, item.spaces.length - LIST_INDENT);

  const newLineText = `${newSpaces}${item.num}. ${item.content}`;

  // Collect the entire contiguous list block
  const { firstLine, lastLine } = findListBlock(state, sel.head);
  const blockLines: string[] = [];
  for (let n = firstLine; n <= lastLine; n++) {
    blockLines.push(n === line.number ? newLineText : state.doc.line(n).text);
  }

  // Renumber all ordered items in the block
  const renumbered = renumberBlock(blockLines);
  const newBlockText = renumbered.join('\n');

  // Place cursor right after the list marker of the updated line
  const currentLineIdx = line.number - firstLine;
  const newCurrentLine = renumbered[currentLineIdx];
  const markerLen = newCurrentLine.match(/^(\s*\d+[.)]\s)/)?.[1].length ?? 0;

  const blockFrom = state.doc.line(firstLine).from;
  const offsetToCurrentLine = renumbered
    .slice(0, currentLineIdx)
    .reduce((sum, l) => sum + l.length + 1, 0); // +1 per newline character

  const newCursorPos = blockFrom + offsetToCurrentLine + markerLen;

  view.dispatch({
    changes: {
      from: blockFrom,
      to: state.doc.line(lastLine).to,
      insert: newBlockText,
    },
    selection: { anchor: newCursorPos },
    userEvent: isIndent ? 'input.indent' : 'input.dedent',
  });

  return true; // key event consumed
}

// ---------------------------------------------------------------------------
// Exported extension
// ---------------------------------------------------------------------------

/**
 * Add this to a CodeMirror editor's extensions to enable smart indent/dedent
 * for ordered markdown lists.  Uses Prec.highest so that the list handler is
 * always checked before the editor's default Tab / Shift-Tab bindings; because
 * it returns `false` for non-list lines, default behaviour is preserved
 * everywhere else.
 */
export const listIndentExtension = Prec.highest(
  keymap.of([
    { key: 'Tab', run: (view) => handleListIndent(view, true) },
    { key: 'Shift-Tab', run: (view) => handleListIndent(view, false) },
  ])
);
