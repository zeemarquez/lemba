'use client';

import { PlateElement, useEditorRef } from 'platejs/react';
import * as React from 'react';
import { Info, Lightbulb, CircleAlert, TriangleAlert, Siren } from 'lucide-react';

import { Button } from '@/components/plate-ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/plate-ui/dropdown-menu';
import { cn } from '@/lib/utils';

type AlertType = 'NOTE' | 'TIP' | 'IMPORTANT' | 'WARNING' | 'CAUTION';

const LUCIDE_ICON_MAP: Record<string, React.ComponentType<{ className?: string }>> = {
  'lucide:info': Info,
  'lucide:lightbulb': Lightbulb,
  'lucide:circle-alert': CircleAlert,
  'lucide:triangle-alert': TriangleAlert,
  'lucide:siren': Siren,
};

const ALERT_ICONS: Record<AlertType, React.ComponentType<{ className?: string }>> = {
  NOTE: Info,
  TIP: Lightbulb,
  IMPORTANT: CircleAlert,
  WARNING: TriangleAlert,
  CAUTION: Siren,
};

const ALERT_TYPES: Array<{ type: AlertType; icon: string; label: string; backgroundColor: string }> = [
  { type: 'NOTE', icon: 'lucide:info', label: 'NOTE', backgroundColor: 'hsla(210, 100%, 50%, 0.1)' },
  { type: 'TIP', icon: 'lucide:lightbulb', label: 'TIP', backgroundColor: 'hsla(120, 100%, 25%, 0.1)' },
  { type: 'IMPORTANT', icon: 'lucide:circle-alert', label: 'IMPORTANT', backgroundColor: 'hsla(280, 100%, 50%, 0.1)' },
  { type: 'WARNING', icon: 'lucide:triangle-alert', label: 'WARNING', backgroundColor: 'hsla(45, 100%, 50%, 0.1)' },
  { type: 'CAUTION', icon: 'lucide:siren', label: 'CAUTION', backgroundColor: 'hsla(0, 100%, 50%, 0.1)' },
];

function CalloutIcon({ icon }: { icon: string }) {
  const LucideIcon = LUCIDE_ICON_MAP[icon];
  if (LucideIcon) return <LucideIcon className="size-[18px] shrink-0" />;
  return (
    <span
      className="text-[18px]"
      style={{
        fontFamily: '"Apple Color Emoji", "Segoe UI Emoji", NotoColorEmoji, "Noto Color Emoji", "Segoe UI Symbol", "Android Emoji", EmojiSymbols',
      }}
    >
      {icon}
    </span>
  );
}

export function CalloutElement({
  attributes,
  children,
  className,
  ...props
}: React.ComponentProps<typeof PlateElement>) {
  const editor = useEditorRef();
  const [open, setOpen] = React.useState(false);

  const currentIcon = (props.element.icon as any) || 'lucide:info';

  const handleSelectAlertType = (alertType: (typeof ALERT_TYPES)[number]) => {
    const path = editor.api.findPath(props.element);
    if (path) {
      editor.tf.setNodes(
        {
          icon: alertType.icon,
          backgroundColor: alertType.backgroundColor,
        },
        { at: path }
      );
    }
    setOpen(false);
  };

  return (
    <PlateElement
      attributes={{
        ...attributes,
        'data-plate-open-context-menu': true,
      }}
      className={cn('my-1 flex rounded-sm bg-muted p-4 pl-3', className)}
      style={{
        backgroundColor: props.element.backgroundColor as any,
      }}
      {...props}
    >
      <div className="flex w-full gap-2 rounded-md">
        <DropdownMenu open={open} onOpenChange={setOpen}>
          <DropdownMenuTrigger asChild>
            <Button
              className="size-6 select-none p-1 hover:bg-muted-foreground/15 flex items-center justify-center"
              contentEditable={false}
              variant="ghost"
            >
              <CalloutIcon icon={currentIcon} />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="min-w-[180px]">
            {ALERT_TYPES.map((alertType) => {
              const IconComponent = ALERT_ICONS[alertType.type];
              return (
                <DropdownMenuItem
                  key={alertType.type}
                  onSelect={() => handleSelectAlertType(alertType)}
                  className="flex items-center gap-2"
                >
                  <IconComponent className="size-4 shrink-0" />
                  <span>{alertType.label}</span>
                </DropdownMenuItem>
              );
            })}
          </DropdownMenuContent>
        </DropdownMenu>
        <div className="w-full">{children}</div>
      </div>
    </PlateElement>
  );
}
