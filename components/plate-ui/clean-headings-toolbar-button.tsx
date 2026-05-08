'use client';

import * as React from 'react';
import { EraserIcon } from 'lucide-react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/plate-ui/alert-dialog';
import { useStore } from '@/lib/store';
import { ToolbarButton } from './toolbar';

/**
 * Strips hardcoded numbering prefixes from markdown headings.
 * Examples:
 *   ## 2. Ordering Information  →  ## Ordering Information
 *   ### 2.1 Model Naming        →  ### Model Naming
 *   #### 1.2.3 Deep Section     →  #### Deep Section
 */
function stripHeadingNumbers(markdown: string): string {
  return markdown.replace(/^(#{1,6})\s+(?:\d+\.)+\d*\s+/gm, '$1 ');
}

export function CleanHeadingsToolbarButton() {
  const { activeFileId, files, updateFileContent } = useStore();

  const handleClean = () => {
    if (!activeFileId) return;
    const activeFile = files.find((f) => f.id === activeFileId);
    if (!activeFile) return;

    const cleaned = stripHeadingNumbers(activeFile.content);
    updateFileContent(activeFileId, cleaned);
  };

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <ToolbarButton tooltip="Clean heading numbers">
          <EraserIcon size={18} />
        </ToolbarButton>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Remove heading numbers</AlertDialogTitle>
          <AlertDialogDescription>
            This will remove all hardcoded numbering from headings in the
            document — for example{' '}
            <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs">
              ## 2. Title
            </code>{' '}
            becomes{' '}
            <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs">
              ## Title
            </code>
            . This prevents conflicts with the template&apos;s auto-numbering
            feature.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={handleClean}>Clean</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
