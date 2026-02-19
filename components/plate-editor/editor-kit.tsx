'use client';

import { TrailingBlockPlugin, type Value } from 'platejs';
import { type TPlateEditor, useEditorRef } from 'platejs/react';


import { AlignKit } from '@/components/plate-editor/plugins/align-kit';
import { AutoformatKit } from '@/components/plate-editor/plugins/autoformat-kit';
import { BasicBlocksKit } from '@/components/plate-editor/plugins/basic-blocks-kit';
import { BasicMarksKit } from '@/components/plate-editor/plugins/basic-marks-kit';
import { BlockMenuKit } from '@/components/plate-editor/plugins/block-menu-kit';
import { BlockPlaceholderKit } from '@/components/plate-editor/plugins/block-placeholder-kit';
import { CalloutKit } from '@/components/plate-editor/plugins/callout-kit';
import { CollapsibleHeadingsPlugin } from '@/components/plate-editor/plugins/collapsible-headings-kit';
import { CodeBlockKit } from '@/components/plate-editor/plugins/code-block-kit';
import { ColumnKit } from '@/components/plate-editor/plugins/column-kit';
import { CommentKit } from '@/components/plate-editor/plugins/comment-kit';

import { CursorOverlayKit } from '@/components/plate-editor/plugins/cursor-overlay-kit';
import { DateKit } from '@/components/plate-editor/plugins/date-kit';
import { DiscussionKit } from '@/components/plate-editor/plugins/discussion-kit';
import { DndKit } from '@/components/plate-editor/plugins/dnd-kit';
import { DocxKit } from '@/components/plate-editor/plugins/docx-kit';
import { EmojiKit } from '@/components/plate-editor/plugins/emoji-kit';
import { ExitBreakKit } from '@/components/plate-editor/plugins/exit-break-kit';
import { FixedToolbarKit } from '@/components/plate-editor/plugins/fixed-toolbar-kit';
import { FloatingToolbarKit } from '@/components/plate-editor/plugins/floating-toolbar-kit';
import { FontKit } from '@/components/plate-editor/plugins/font-kit';
import { LineHeightKit } from '@/components/plate-editor/plugins/line-height-kit';
import { LinkKit } from '@/components/plate-editor/plugins/link-kit';
import { ListKit } from '@/components/plate-editor/plugins/list-kit';
import { MarkdownKit } from '@/components/plate-editor/plugins/markdown-kit';
import { MathKit } from '@/components/plate-editor/plugins/math-kit';
import { MediaKit } from '@/components/plate-editor/plugins/media-kit';
import { MentionKit } from '@/components/plate-editor/plugins/mention-kit';
import { SlashKit } from '@/components/plate-editor/plugins/slash-kit';
import { SuggestionKit } from '@/components/plate-editor/plugins/suggestion-kit';
import { TableKit } from '@/components/plate-editor/plugins/table-kit';
import { HtmlTableKit } from '@/components/plate-editor/plugins/html-table-kit';
import { TocKit } from '@/components/plate-editor/plugins/toc-kit';
import { ToggleKit } from '@/components/plate-editor/plugins/toggle-kit';
import { PageBreakPlugin } from '@/components/plate-editor/plugins/page-break-plugin';
import { PageBreakElement } from '@/components/plate-ui/page-break-element';
import { PlaceholderPlugin } from '@/components/plate-editor/plugins/placeholder-kit';

export const EditorKit = [

  // Elements
  PageBreakPlugin.configure({
    node: { component: PageBreakElement },
  }),
  ...BasicBlocksKit,
  CollapsibleHeadingsPlugin,
  ...CodeBlockKit,
  ...TableKit,
  ...HtmlTableKit,
  ...ToggleKit,
  ...TocKit,
  ...MediaKit,
  ...CalloutKit,
  ...ColumnKit,
  ...MathKit,
  ...DateKit,
  PlaceholderPlugin,
  ...LinkKit,
  ...MentionKit,

  // Marks
  ...BasicMarksKit,
  ...FontKit,

  // Block Style
  ...ListKit,
  ...AlignKit,
  ...LineHeightKit,

  // Collaboration
  ...DiscussionKit,
  ...CommentKit,
  ...SuggestionKit,

  // Editing
  ...SlashKit,
  ...AutoformatKit,
  ...CursorOverlayKit,
  ...BlockMenuKit,
  ...DndKit,
  ...EmojiKit,
  ...ExitBreakKit,
  TrailingBlockPlugin,

  // Parsers
  ...DocxKit,
  ...MarkdownKit,

  // UI
  ...BlockPlaceholderKit,
  ...FloatingToolbarKit,
];

export type MyEditor = TPlateEditor<Value, (typeof EditorKit)[number]>;

export const useEditor = () => useEditorRef<MyEditor>();
