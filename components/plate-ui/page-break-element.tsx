import React from 'react';
import { PlateElement, PlateElementProps } from 'platejs/react';
import { useSelected, useFocused } from 'slate-react';
import { cn } from '@udecode/cn';

export function PageBreakElement({
  className,
  ...props
}: PlateElementProps) {
  const { children, attributes, element } = props;
  const selected = useSelected();
  const focused = useFocused();

  return (
    <PlateElement
      {...props}
      className={cn(className, 'py-2 my-4 select-none')}
      contentEditable={false}
    >
      <div
        contentEditable={false}
        className={cn(
          "flex items-center justify-center gap-2 w-full",
          selected && focused && "ring-2 ring-ring ring-offset-2 rounded"
        )}
      >
        <div className="h-px flex-1 bg-border border-dashed" />
        <span className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium px-2 border rounded bg-muted/50">
          Page Break
        </span>
        <div className="h-px flex-1 bg-border border-dashed" />
      </div>
      {children}
    </PlateElement>
  );
}
