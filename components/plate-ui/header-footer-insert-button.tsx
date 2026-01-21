'use client';

import type { DropdownMenuProps } from '@radix-ui/react-dropdown-menu';
import {
  CalendarIcon,
  FileTextIcon,
  HashIcon,
  ImageIcon,
  LayersIcon,
  Link2Icon,
  MinusIcon,
  PlusIcon,
  SmileIcon,
  TableIcon,
  UploadIcon,
  UnfoldVerticalIcon,
  VariableIcon,
} from 'lucide-react';
import { KEYS, PathApi } from 'platejs';
import { type PlateEditor, useEditorRef } from 'platejs/react';
import { triggerFloatingLink } from '@platejs/link/react';
import { getNextFigureId } from '@/components/plate-editor/transforms';
import { PlaceholderPlugin } from '@platejs/media/react';
import { TablePlugin } from '@platejs/table/react';
import * as React from 'react';
import { useFilePicker } from 'use-file-picker';
import { ImageUploadDialog } from './image-upload-dialog';
import { KEY_PLACEHOLDER } from '@/components/plate-editor/plugins/placeholder-kit';
import { KEY_VERTICAL_SPACER } from '@/components/plate-editor/plugins/vertical-spacer-kit';
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
import { useStore } from '@/lib/store';
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

// Simplified insertBlock for header/footer that doesn't use SuggestionPlugin
const insertBlockSimple = (editor: PlateEditor, type: string, data?: any) => {
  editor.tf.withoutNormalizing(() => {
    const block = editor.api.block();
    if (!block) return;

    const [, path] = block;

    if (type === KEYS.table) {
      editor.getTransforms(TablePlugin).insert.table({}, { select: true });
    } else if (type === KEYS.img) {
      // Insert image with auto-assigned fig-X ID
      editor.tf.insertNodes({
        type: KEYS.img,
        children: [{ text: '' }],
        id: getNextFigureId(editor),
        width: 400,
        align: 'center',
        url: '',
      }, { select: true });
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
    } else if (type === KEY_VERTICAL_SPACER) {
      editor.tf.insertNodes(
        { type: KEY_VERTICAL_SPACER, children: [{ text: '' }], height: 50 },
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
  const [variableDialogOpen, setVariableDialogOpen] = React.useState(false);
  
  // Get template variables from the active template
  const { activeTemplateId, templates } = useStore();
  const activeTemplate = templates.find(t => t.id === activeTemplateId);
  const templateVariables = activeTemplate?.settings?.variables || [];

  const insertVariable = (variableName: string) => {
    insertBlockSimple(editor, KEY_PLACEHOLDER, { 
      placeholderType: 'variable', 
      variableName 
    });
    setVariableDialogOpen(false);
    editor.tf.focus();
  };

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
        {
          icon: <UnfoldVerticalIcon />,
          label: 'Vertical Spacing',
          value: KEY_VERTICAL_SPACER,
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
          data: { placeholderType: 'page', format: 'decimal' }
        },
        {
          icon: <LayersIcon />,
          label: 'Total Pages',
          value: KEY_PLACEHOLDER,
          data: { placeholderType: 'totalPages', format: 'decimal' }
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
        {
          icon: <VariableIcon />,
          label: 'Variable',
          value: 'variable',
          data: { placeholderType: 'variable' }
        },
      ].map((item) => ({
        ...item,
        onSelect: (editor, value) => {
          if (value === 'variable') {
            setVariableDialogOpen(true);
          } else {
            insertBlockSimple(editor, KEY_PLACEHOLDER, item.data);
          }
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

      {/* Variable Selection Dialog */}
      <Dialog open={variableDialogOpen} onOpenChange={setVariableDialogOpen}>
        <DialogContent className="p-0 gap-0 w-[200px]">
          <DialogHeader className="p-3 pb-2">
            <DialogTitle className="text-sm font-medium">Select Variable</DialogTitle>
          </DialogHeader>
          <ScrollArea className="max-h-[200px] p-2 pt-0">
            <div className="flex flex-col">
              {templateVariables.length > 0 ? (
                templateVariables.filter(v => v.name.trim()).map((variable) => (
                  <button
                    key={variable.id}
                    className={cn(
                      "flex items-center gap-2 py-1.5 px-2 text-xs rounded-sm cursor-pointer transition-colors",
                      "hover:bg-accent hover:text-accent-foreground text-left"
                    )}
                    onClick={() => insertVariable(variable.name)}
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
