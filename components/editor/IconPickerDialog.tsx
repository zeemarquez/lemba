'use client';

import * as React from 'react';
import { IconPicker } from '@/components/ui/icon-picker';

interface IconPickerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: (icon: string) => void;
  currentIcon?: string;
  children: React.ReactNode;
}

export function IconPickerDialog({
  open,
  onOpenChange,
  onSelect,
  currentIcon,
  children,
}: IconPickerDialogProps) {
  // Extract icon name from currentIcon (format: "lucide:iconName" or just "iconName")
  const iconName = currentIcon?.startsWith('lucide:') 
    ? currentIcon.replace('lucide:', '') 
    : currentIcon;

  const handleValueChange = (value: string) => {
    // IconPicker returns just the icon name, we need to format it as "lucide:iconName"
    // Remove any existing "lucide:" prefix first, then add it
    const cleanValue = value.replace(/^lucide:/, '');
    const formattedValue = `lucide:${cleanValue}`;
    onSelect(formattedValue);
  };

  return (
    <IconPicker
      open={open}
      onOpenChange={onOpenChange}
      value={iconName}
      onValueChange={handleValueChange}
      modal={true}
      searchable={true}
      searchPlaceholder="Search icons..."
    >
      {children}
    </IconPicker>
  );
}
