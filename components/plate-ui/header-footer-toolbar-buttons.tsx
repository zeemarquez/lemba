'use client';

import {
  BoldIcon,
  ItalicIcon,
} from 'lucide-react';
import { KEYS } from 'platejs';
import { useEditorReadOnly } from 'platejs/react';

import { AlignToolbarButton } from './align-toolbar-button';
import { RedoToolbarButton, UndoToolbarButton } from './history-toolbar-button';
import { HeaderFooterInsertButton } from './header-footer-insert-button';
import { HeaderFooterFontFamilyButton } from './header-footer-font-family-button';
import { FontSizeToolbarButton } from './font-size-toolbar-button';
import { LinkToolbarButton } from './link-toolbar-button';
import { MarkToolbarButton } from './mark-toolbar-button';
import { MoreToolbarButton } from './more-toolbar-button';
import { ToolbarGroup } from './toolbar';

export function HeaderFooterToolbarButtons() {
  const readOnly = useEditorReadOnly();

  return (
    <div className="flex w-full">
      {!readOnly && (
        <>
          <ToolbarGroup>
            <UndoToolbarButton />
            <RedoToolbarButton />
          </ToolbarGroup>

          <ToolbarGroup>
            <HeaderFooterInsertButton />
          </ToolbarGroup>

          <ToolbarGroup>
            <HeaderFooterFontFamilyButton />
            <FontSizeToolbarButton />
          </ToolbarGroup>

          <ToolbarGroup>
            <MarkToolbarButton nodeType={KEYS.bold} tooltip="Bold (⌘+B)">
              <BoldIcon size={18} />
            </MarkToolbarButton>
            <MarkToolbarButton nodeType={KEYS.italic} tooltip="Italic (⌘+I)">
              <ItalicIcon size={18} />
            </MarkToolbarButton>
            <MoreToolbarButton />
          </ToolbarGroup>

          <ToolbarGroup>
            <LinkToolbarButton />
            <AlignToolbarButton />
          </ToolbarGroup>
        </>
      )}

      <div className="grow" />
    </div>
  );
}
