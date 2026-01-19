'use client';

import {
  FloatingMedia as FloatingMediaPrimitive,
  FloatingMediaStore,
  useFloatingMediaValue,
  useImagePreviewValue,
} from '@platejs/media/react';
import { cva } from 'class-variance-authority';
import { Link, Trash2Icon } from 'lucide-react';
import type { WithRequiredKey } from 'platejs';
import {
  useEditorRef,
  useEditorSelector,
  useElement,
  useFocusedLast,
  useReadOnly,
  useRemoveNodeButton,
  useSelected,
} from 'platejs/react';
import * as React from 'react';

import { Button, buttonVariants } from '@/components/plate-ui/button';
import { Input } from '@/components/plate-ui/input';
import {
  Popover,
  PopoverAnchor,
  PopoverContent,
} from '@/components/plate-ui/popover';
import { Separator } from '@/components/plate-ui/separator';
import { isFigureIdUnique } from '@/components/plate-editor/transforms';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

import { CaptionButton } from './caption';

const inputVariants = cva(
  'flex h-[28px] w-full rounded-md border-none bg-transparent px-1.5 py-1 text-base placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-transparent md:text-sm'
);

export function MediaToolbar({
  children,
  plugin,
}: {
  children: React.ReactNode;
  plugin: WithRequiredKey;
}) {
  const editor = useEditorRef();
  const readOnly = useReadOnly();
  const selected = useSelected();
  const isFocusedLast = useFocusedLast();
  const selectionCollapsed = useEditorSelector(
    (editor) => !editor.api.isExpanded(),
    []
  );
  const isImagePreviewOpen = useImagePreviewValue('isOpen', editor.id);
  const open =
    isFocusedLast &&
    !readOnly &&
    selected &&
    selectionCollapsed &&
    !isImagePreviewOpen;
  const isEditing = useFloatingMediaValue('isEditing');
  const [isEditingLabel, setIsEditingLabel] = React.useState(false);
  const element = useElement();
  const [labelValue, setLabelValue] = React.useState(element.id as string || '');

  React.useEffect(() => {
    setLabelValue(element.id as string || '');
  }, [element.id]);

  const handleLabelSubmit = () => {
    if (labelValue === element.id) {
      setIsEditingLabel(false);
      return;
    }

    if (labelValue && !isFigureIdUnique(editor, labelValue, editor.api.path(element))) {
      return toast.error('This label is already in use');
    }

    editor.tf.setNodes({ id: labelValue }, { at: editor.api.path(element) });
    setIsEditingLabel(false);
  };

  React.useEffect(() => {
    if (!open && isEditing) {
      FloatingMediaStore.set('isEditing', false);
    }
    if (!open && isEditingLabel) {
      setIsEditingLabel(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const { props: buttonProps } = useRemoveNodeButton({ element });

  return (
    <Popover modal={false} open={open}>
      <PopoverAnchor>{children}</PopoverAnchor>

      <PopoverContent
        className="w-auto p-1"
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        {isEditing ? (
          <div className="flex w-[330px] flex-col">
            <div className="flex items-center">
              <div className="flex items-center pr-1 pl-2 text-muted-foreground">
                <Link className="size-4" />
              </div>

              <FloatingMediaPrimitive.UrlInput
                className={inputVariants()}
                options={{ plugin }}
                placeholder="Paste the embed link..."
              />
            </div>
          </div>
        ) : isEditingLabel ? (
          <div className="flex w-[330px] flex-col p-1">
            <div className="flex items-center gap-2">
              <Input
                className="h-8"
                placeholder="Figure label (e.g. fig-1)"
                value={labelValue}
                onChange={(e) => setLabelValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleLabelSubmit();
                  if (e.key === 'Escape') setIsEditingLabel(false);
                }}
                autoFocus
              />
              <Button size="sm" onClick={handleLabelSubmit}>
                Save
              </Button>
            </div>
          </div>
        ) : (
          <div className="box-content flex items-center">
            <FloatingMediaPrimitive.EditButton
              className={buttonVariants({ size: 'sm', variant: 'ghost' })}
            >
              Edit link
            </FloatingMediaPrimitive.EditButton>

            <CaptionButton size="sm" variant="ghost">
              Caption
            </CaptionButton>

            <Button 
              size="sm" 
              variant="ghost" 
              onClick={() => setIsEditingLabel(true)}
              className={cn(element.id && 'text-primary')}
            >
              Label
            </Button>

            <Separator className="mx-1 h-6" orientation="vertical" />

            <Button size="sm" variant="ghost" {...buttonProps}>
              <Trash2Icon />
            </Button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
