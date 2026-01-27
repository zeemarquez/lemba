'use client';

import { SuggestionPlugin } from '@platejs/suggestion/react';
import {
  DropdownMenuItemIndicator,
  type DropdownMenuProps,
} from '@radix-ui/react-dropdown-menu';
import { CheckIcon, EyeIcon, PencilLineIcon, PenIcon, Code2Icon } from 'lucide-react';
import { useEditorRef, usePlateState, usePluginOption } from 'platejs/react';
import * as React from 'react';
import { useStore } from '@/lib/store';

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '@/components/plate-ui/dropdown-menu';

import { ToolbarButton } from './toolbar';

export function ModeToolbarButton(props: DropdownMenuProps) {
  const { editorViewMode, setEditorViewMode } = useStore();
  const editor = useEditorRef();
  const [readOnly, setReadOnly] = usePlateState('readOnly');
  const [open, setOpen] = React.useState(false);

  // Sync Plate state with store
  React.useEffect(() => {
    if (editorViewMode === 'viewing') {
      setReadOnly(true);
    } else {
      setReadOnly(false);
    }

    if (editorViewMode === 'suggestion') {
      editor.setOption(SuggestionPlugin, 'isSuggesting', true);
    } else {
      editor.setOption(SuggestionPlugin, 'isSuggesting', false);
    }
  }, [editorViewMode, editor, setReadOnly]);

  const item: Record<string, { icon: React.ReactNode; label: string }> = {
    editing: {
      icon: <PenIcon size={16} />,
      label: 'Editing',
    },
    suggestion: {
      icon: <PencilLineIcon size={16} />,
      label: 'Suggestion',
    },
    viewing: {
      icon: <EyeIcon size={16} />,
      label: 'Viewing',
    },
    source: {
      icon: <Code2Icon size={16} />,
      label: 'Source',
    }
  };

  return (
    <DropdownMenu modal={false} onOpenChange={setOpen} open={open} {...props}>
      <DropdownMenuTrigger asChild>
        <ToolbarButton isDropdown pressed={open} tooltip="Editing mode">
          {item[editorViewMode].icon}
          <span className="hidden lg:inline ml-2">{item[editorViewMode].label}</span>
        </ToolbarButton>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="start" className="min-w-[180px]">
        <DropdownMenuRadioGroup
          onValueChange={(newValue) => {
            setEditorViewMode(newValue as any);
            if (newValue === 'editing') {
              editor.tf.focus();
            }
          }}
          value={editorViewMode}
        >
          <DropdownMenuRadioItem
            className="pl-2 *:first:[span]:hidden *:[svg]:text-muted-foreground"
            value="editing"
          >
            <Indicator />
            {item.editing.icon}
            <span className="ml-2">{item.editing.label}</span>
          </DropdownMenuRadioItem>

          <DropdownMenuRadioItem
            className="pl-2 *:first:[span]:hidden *:[svg]:text-muted-foreground"
            value="source"
          >
            <Indicator />
            {item.source.icon}
            <span className="ml-2">{item.source.label}</span>
          </DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function Indicator() {
  return (
    <span className="pointer-events-none absolute right-2 flex size-3.5 items-center justify-center">
      <DropdownMenuItemIndicator>
        <CheckIcon />
      </DropdownMenuItemIndicator>
    </span>
  );
}
