'use client';

import type { DropdownMenuProps } from '@radix-ui/react-dropdown-menu';
import {
  AlertCircle,
  CalendarIcon,
  ChevronRightIcon,
  Columns3Icon,
  FileCodeIcon,
  FileTextIcon,
  Heading1Icon,
  Heading2Icon,
  Heading3Icon,
  LayersIcon,
  ImageIcon,
  HashIcon,
  Link2Icon,
  ListIcon,
  ListOrderedIcon,
  MinusIcon,
  PilcrowIcon,
  PlusIcon,
  QuoteIcon,
  RadicalIcon,
  SquareIcon,
  SmileIcon,
  TableIcon,
  TableOfContentsIcon,
  FoldVerticalIcon,
  VariableIcon,
} from 'lucide-react';
import { KEYS } from 'platejs';
import { type PlateEditor, useEditorRef } from 'platejs/react';
import * as React from 'react';
import { ImageUploadDialog } from './image-upload-dialog';
import {
  insertBlock,
  insertInlineElement,
} from '@/components/plate-editor/transforms';
import { ELEMENT_PAGE_BREAK } from '@/components/plate-editor/plugins/page-break-plugin';
import { KEY_PLACEHOLDER } from '@/components/plate-editor/plugins/placeholder-kit';
import { useStore } from '@/lib/store';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/plate-ui/dropdown-menu';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/plate-ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';

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

const placeholderGroups: Group[] = [
  {
    group: 'Placeholders',
    items: [
      {
        icon: <HashIcon />,
        label: 'Page Number',
        value: KEY_PLACEHOLDER,
        data: { placeholderType: 'page', format: 'decimal' },
      },
      {
        icon: <LayersIcon />,
        label: 'Total Pages',
        value: KEY_PLACEHOLDER,
        data: { placeholderType: 'totalPages', format: 'decimal' },
      },
      {
        icon: <CalendarIcon />,
        label: 'Current Date',
        value: KEY_PLACEHOLDER,
        data: { placeholderType: 'date', format: 'default' },
      },
      {
        icon: <FileTextIcon />,
        label: 'File Title',
        value: KEY_PLACEHOLDER,
        data: { placeholderType: 'title' },
      },
      {
        icon: <VariableIcon />,
        label: 'Variable',
        value: 'variable',
        data: { placeholderType: 'variable' },
      },
    ].map((item) => ({
      ...item,
      onSelect: () => {},
    })),
  },
];

const groups: Group[] = [
  {
    group: 'Basic blocks',
    items: [
      {
        icon: <PilcrowIcon />,
        label: 'Paragraph',
        value: KEYS.p,
      },
      {
        icon: <Heading1Icon />,
        label: 'Heading 1',
        value: 'h1',
      },
      {
        icon: <Heading2Icon />,
        label: 'Heading 2',
        value: 'h2',
      },
      {
        icon: <Heading3Icon />,
        label: 'Heading 3',
        value: 'h3',
      },
      {
        icon: <TableIcon />,
        label: 'Table',
        value: KEYS.table,
      },
      {
        icon: <FileCodeIcon />,
        label: 'Code',
        value: KEYS.codeBlock,
      },
      {
        icon: <QuoteIcon />,
        label: 'Quote',
        value: KEYS.blockquote,
      },
      {
        icon: <AlertCircle />,
        label: 'Alert',
        value: KEYS.callout,
      },
      {
        icon: <MinusIcon />,
        label: 'Divider',
        value: KEYS.hr,
      },
      {
        icon: <FoldVerticalIcon />,
        label: 'Page Break',
        value: ELEMENT_PAGE_BREAK,
      },
    ].map((item) => ({
      ...item,
      onSelect: (editor, value) => {
        insertBlock(editor, value);
      },
    })),
  },
  {
    group: 'Lists',
    items: [
      {
        icon: <ListIcon />,
        label: 'Bulleted list',
        value: KEYS.ul,
      },
      {
        icon: <ListOrderedIcon />,
        label: 'Numbered list',
        value: KEYS.ol,
      },
      {
        icon: <SquareIcon />,
        label: 'To-do list',
        value: KEYS.listTodo,
      },
      {
        icon: <ChevronRightIcon />,
        label: 'Toggle list',
        value: KEYS.toggle,
      },
    ].map((item) => ({
      ...item,
      onSelect: (editor, value) => {
        insertBlock(editor, value);
      },
    })),
  },
  {
    group: 'Media',
    items: [
      {
        icon: <ImageIcon />,
        label: 'Image',
        value: KEYS.img,
      },
    ].map((item) => ({
      ...item,
      onSelect: (editor, value) => {
        insertBlock(editor, value);
      },
    })),
  },
  {
    group: 'Advanced blocks',
    items: [
      {
        icon: <TableOfContentsIcon />,
        label: 'Table of contents',
        value: KEYS.toc,
      },
      {
        icon: <Columns3Icon />,
        label: '3 columns',
        value: 'action_three_columns',
      },
      {
        focusEditor: false,
        icon: <RadicalIcon />,
        label: 'Equation',
        value: KEYS.equation,
      },
    ].map((item) => ({
      ...item,
      onSelect: (editor, value) => {
        insertBlock(editor, value);
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
        focusEditor: true,
        icon: <CalendarIcon />,
        label: 'Date',
        value: KEYS.date,
      },
      {
        focusEditor: false,
        icon: <RadicalIcon />,
        label: 'Inline Equation',
        value: KEYS.inlineEquation,
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
        insertInlineElement(editor, value);
      },
    })),
  },
];

const buildPlaceholderToken = (data?: Record<string, unknown>) => {
  const placeholderType = data?.placeholderType as string | undefined;
  const format = typeof data?.format === 'string' ? data?.format.trim() : '';
  const variableName = typeof data?.variableName === 'string' ? data?.variableName.trim() : '';

  if (placeholderType === 'page') {
    return format && format !== 'decimal' ? `{{page:${format}}}` : '{{page}}';
  }
  if (placeholderType === 'totalPages') {
    return format && format !== 'decimal' ? `{{totalPages:${format}}}` : '{{totalPages}}';
  }
  if (placeholderType === 'date') {
    return format && format !== 'default' ? `{{date:${format}}}` : '{{date}}';
  }
  if (placeholderType === 'title') {
    return '{{title}}';
  }
  if (placeholderType === 'variable') {
    return variableName ? `{{var:${variableName}}}` : '{{var}}';
  }

  return '{{placeholder}}';
};

export function InsertToolbarButton(props: DropdownMenuProps) {
  const editor = useEditorRef();
  const [open, setOpen] = React.useState(false);
  const [imageDialogOpen, setImageDialogOpen] = React.useState(false);
  const [variableDialogOpen, setVariableDialogOpen] = React.useState(false);

  const { activeTemplateId, templates, editorViewMode } = useStore();
  const activeTemplate = templates.find((t) => t.id === activeTemplateId);
  const templateVariables = activeTemplate?.settings?.variables || [];

  const insertPlaceholder = (data: Record<string, unknown>) => {
    editor.tf.insertNodes(
      { type: KEY_PLACEHOLDER, children: [{ text: '' }], ...data },
      { select: true }
    );
  };

  const insertVariablePlaceholder = (variableName: string) => {
    if (editorViewMode === 'source') {
      const token = buildPlaceholderToken({ placeholderType: 'variable', variableName });
      window.dispatchEvent(new CustomEvent('insert-source-text', { detail: { text: token } }));
    } else {
      insertPlaceholder({ placeholderType: 'variable', variableName });
    }
    setVariableDialogOpen(false);
    if (editorViewMode !== 'source') {
      editor.tf.focus();
    }
  };

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
          {[...groups.slice(0, 4), ...placeholderGroups, ...groups.slice(4)].map(({ group, items: nestedItems }) => (
            <ToolbarMenuGroup key={group} label={group}>
              {nestedItems.map(({ icon, label, value, onSelect, data }) => (
                <DropdownMenuItem
                  className="min-w-[180px]"
                  key={label ?? value}
                  onSelect={() => {
                    if (value === 'variable') {
                      setVariableDialogOpen(true);
                      return;
                    }
                    if (editorViewMode === 'source' && value === KEY_PLACEHOLDER) {
                      const token = buildPlaceholderToken(data || {});
                      window.dispatchEvent(new CustomEvent('insert-source-text', { detail: { text: token } }));
                      return;
                    }
                    if (value === KEYS.img) {
                      setImageDialogOpen(true);
                    } else {
                      if (value === KEY_PLACEHOLDER) {
                        insertPlaceholder(data || {});
                      } else {
                        onSelect(editor, value);
                      }
                    }
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

      <Dialog open={variableDialogOpen} onOpenChange={setVariableDialogOpen}>
        <DialogContent className="p-0 gap-0 w-[200px]">
          <DialogHeader className="p-3 pb-2">
            <DialogTitle className="text-sm font-medium">Select Variable</DialogTitle>
          </DialogHeader>
          <ScrollArea className="max-h-[200px] p-2 pt-0">
            <div className="flex flex-col">
              {templateVariables.length > 0 ? (
                templateVariables.filter((v) => v.name.trim()).map((variable) => (
                  <button
                    key={variable.id}
                    className={cn(
                      "flex items-center gap-2 py-1.5 px-2 text-xs rounded-sm cursor-pointer transition-colors",
                      "hover:bg-accent hover:text-accent-foreground text-left"
                    )}
                    onClick={() => insertVariablePlaceholder(variable.name)}
                  >
                    <VariableIcon size={12} className="text-muted-foreground shrink-0" />
                    <span className="truncate">{variable.name}</span>
                  </button>
                ))
              ) : (
                <div className="text-xs text-muted-foreground text-center py-4 px-2">
                  No variables defined.
                </div>
              )}
            </div>
          </ScrollArea>
        </DialogContent>
      </Dialog>
    </>
  );
}
