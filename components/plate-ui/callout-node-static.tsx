import type { SlateElementProps } from 'platejs/static';
import { SlateElement } from 'platejs/static';
import { Info, Lightbulb, CircleAlert, TriangleAlert, Siren } from 'lucide-react';

import { cn } from '@/lib/utils';

const LUCIDE_ICON_MAP: Record<string, React.ComponentType<{ className?: string }>> = {
  'lucide:info': Info,
  'lucide:lightbulb': Lightbulb,
  'lucide:circle-alert': CircleAlert,
  'lucide:triangle-alert': TriangleAlert,
  'lucide:siren': Siren,
};

function CalloutIconStatic({ icon }: { icon: string }) {
  const LucideIcon = LUCIDE_ICON_MAP[icon];
  if (LucideIcon) return <LucideIcon className="size-[18px] shrink-0" />;
  return (
    <span
      className="text-[18px]"
      style={{
        fontFamily:
          '"Apple Color Emoji", "Segoe UI Emoji", NotoColorEmoji, "Noto Color Emoji", "Segoe UI Symbol", "Android Emoji", EmojiSymbols',
      }}
    >
      {icon}
    </span>
  );
}

export function CalloutElementStatic({
  children,
  className,
  ...props
}: SlateElementProps) {
  const icon = (props.element.icon as any) || 'lucide:info';
  return (
    <SlateElement
      className={cn('my-1 flex rounded-sm bg-muted p-4 pl-3', className)}
      style={{
        backgroundColor: props.element.backgroundColor as any,
      }}
      {...props}
    >
      <div className="flex w-full gap-2 rounded-md">
        <div className="size-6 select-none flex items-center justify-center" data-plate-prevent-deserialization>
          <CalloutIconStatic icon={icon} />
        </div>
        <div className="w-full">{children}</div>
      </div>
    </SlateElement>
  );
}
