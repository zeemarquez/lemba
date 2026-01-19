'use client';

import type { DropdownMenuProps } from '@radix-ui/react-dropdown-menu';
import {
  CalendarIcon,
  FileTextIcon,
  HashIcon,
  ImageIcon,
  Link2Icon,
  MinusIcon,
  PlusIcon,
  SmileIcon,
  TableIcon,
  UploadIcon,
} from 'lucide-react';
import { KEYS, PathApi } from 'platejs';
import { type PlateEditor, useEditorRef } from 'platejs/react';
import { triggerFloatingLink } from '@platejs/link/react';
import { insertMedia } from '@platejs/media';
import { PlaceholderPlugin } from '@platejs/media/react';
import { TablePlugin } from '@platejs/table/react';
import * as React from 'react';
import { useFilePicker } from 'use-file-picker';
import { ImageUploadDialog } from './image-upload-dialog';
import { KEY_PLACEHOLDER } from '@/components/plate-editor/plugins/placeholder-kit';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/plate-ui/dropdown-menu';

import { ToolbarButton, ToolbarMenuGroup } from './toolbar';

type Group = {
  group: string;
  items: Item[];
};

type Item = {
  icon: React.ReactNode;
  value: string;
  onSelect: (editor: PlateEditor, value: string) => void;
  focusEditor?: boolean;
  label?: string;
  data?: any;
};

// Simplified insertBlock for header/footer that doesn't use SuggestionPlugin
const insertBlockSimple = (editor: PlateEditor, type: string, data?: any) => {
  editor.tf.withoutNormalizing(() => {
    const block = editor.api.block();
    if (!block) return;

    const [, path] = block;

    if (type === KEYS.table) {
      editor.getTransforms(TablePlugin).insert.table({}, { select: true });
    } else if (type === KEYS.img) {
      insertMedia(editor, { select: true, type: KEYS.img });
    } else if (type === KEY_PLACEHOLDER) {
      editor.tf.insertNodes(
        { type: KEY_PLACEHOLDER, children: [{ text: '' }], ...data },
        { select: true }
      );
    } else if (type === KEYS.hr) {
      editor.tf.insertNodes(
        { type: KEYS.hr, children: [{ text: '' }] },
        { at: PathApi.next(path), select: true }
      );
    } else {
      editor.tf.insertNodes(
        editor.api.create.block({ type }),
        { at: PathApi.next(path), select: true }
      );
    }
  });
};

export function HeaderFooterInsertButton(props: DropdownMenuProps) {
  const editor = useEditorRef();
  const [open, setOpen] = React.useState(false);
  const [imageDialogOpen, setImageDialogOpen] = React.useState(false);

  const groups: Group[] = [
    {
      group: 'Blocks',
      items: [
        {
          icon: <TableIcon />,
          label: 'Table',
          value: KEYS.table,
        },
        {
          icon: <MinusIcon />,
          label: 'Divider',
          value: KEYS.hr,
        },
        {
          icon: <ImageIcon />,
          label: 'Image',
          value: KEYS.img,
        },
      ].map((item) => ({
        ...item,
        onSelect: (editor, value) => {
          if (value === KEYS.img) {
            setImageDialogOpen(true);
          } else {
            insertBlockSimple(editor, value);
          }
        },
      })),
    },
    {
      group: 'Placeholders',
      items: [
        {
          icon: <HashIcon />,
          label: 'Page Number',
          value: KEY_PLACEHOLDER,
          data: { placeholderType: 'page', format: 'decimal', offset: 0 }
        },
        {
          icon: <CalendarIcon />,
          label: 'Current Date',
          value: KEY_PLACEHOLDER,
          data: { placeholderType: 'date', format: 'default' }
        },
        {
          icon: <FileTextIcon />,
          label: 'File Title',
          value: KEY_PLACEHOLDER,
          data: { placeholderType: 'title' }
        },
      ].map((item) => ({
        ...item,
        onSelect: (editor, value) => {
          insertBlockSimple(editor, value, item.data);
        },
      })),
    },
    {
      group: 'Inline',
      items: [
        {
          icon: <Link2Icon />,
          label: 'Link',
          value: KEYS.link,
        },
        {
          icon: <SmileIcon />,
          label: 'Emoji',
          value: 'emoji',
        },
      ].map((item) => ({
        ...item,
        onSelect: (editor, value) => {
          if (value === 'emoji') {
            // Todo: trigger emoji picker
            return;
          }
          if (value === KEYS.link) {
            triggerFloatingLink(editor, { focused: true });
          }
        },
      })),
    },
  ];

  return (
    <>
      <DropdownMenu modal={false} onOpenChange={setOpen} open={open} {...props}>
        <DropdownMenuTrigger asChild>
          <ToolbarButton isDropdown pressed={open} tooltip="Insert">
            <PlusIcon />
          </ToolbarButton>
        </DropdownMenuTrigger>

        <DropdownMenuContent
          align="start"
          className="flex max-h-[500px] min-w-0 flex-col overflow-y-auto"
        >
          {groups.map(({ group, items: nestedItems }) => (
            <ToolbarMenuGroup key={group} label={group}>
              {nestedItems.map(({ icon, label, value, onSelect }) => (
                <DropdownMenuItem
                  className="min-w-[180px]"
                  key={label} // Use label instead of value since multiple items share value now
                  onSelect={() => {
                    onSelect(editor, value);
                    editor.tf.focus();
                  }}
                >
                  {icon}
                  {label}
                </DropdownMenuItem>
              ))}
            </ToolbarMenuGroup>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>

      <ImageUploadDialog
        open={imageDialogOpen}
        onOpenChange={setImageDialogOpen}
      />
    </>
  );
}
