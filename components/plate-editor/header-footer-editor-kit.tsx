'use client';

import { TrailingBlockPlugin } from 'platejs';

import { AlignKit } from '@/components/plate-editor/plugins/align-kit';
import { BasicBlocksKit } from '@/components/plate-editor/plugins/basic-blocks-kit';
import { BasicMarksKit } from '@/components/plate-editor/plugins/basic-marks-kit';
import { ExitBreakKit } from '@/components/plate-editor/plugins/exit-break-kit';
import { FontKit } from '@/components/plate-editor/plugins/font-kit';
import { LinkKit } from '@/components/plate-editor/plugins/link-kit';
import { MarkdownKit } from '@/components/plate-editor/plugins/markdown-kit';
import { MathKit } from '@/components/plate-editor/plugins/math-kit';
import { FloatingToolbarKit } from '@/components/plate-editor/plugins/floating-toolbar-kit';
import { BlockPlaceholderKit } from '@/components/plate-editor/plugins/block-placeholder-kit';
import { MediaKit } from '@/components/plate-editor/plugins/media-kit';
import { TableKit } from '@/components/plate-editor/plugins/table-kit';
import { PlaceholderPlugin } from '@/components/plate-editor/plugins/placeholder-kit';

// Simplified kit for header/footer editors
// Only includes: table, divider, image, link, emoji + font controls
export const HeaderFooterEditorKit = [
  // Elements - simplified set
  ...BasicBlocksKit,
  ...LinkKit,
  ...MediaKit,
  ...TableKit,
  ...MathKit,
  PlaceholderPlugin,

  // Marks
  ...BasicMarksKit,

  // Font styling
  ...FontKit,

  // Block Style
  ...AlignKit,

  // Editing
  ...ExitBreakKit,
  TrailingBlockPlugin,

  // Parsers
  ...MarkdownKit,

  // UI
  ...BlockPlaceholderKit,
  ...FloatingToolbarKit,
];
