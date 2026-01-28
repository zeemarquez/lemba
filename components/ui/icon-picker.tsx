"use client";

import * as React from "react";
import { useState, useMemo, useCallback, useEffect } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/plate-ui/popover";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/plate-ui/input";
import { cn } from "@/lib/utils";
import { IconName, DynamicIcon } from 'lucide-react/dynamic';
import * as LucideIcons from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { iconsData } from "./icons-data";
import { useVirtualizer, VirtualItem } from '@tanstack/react-virtual';
import { Skeleton } from "@/components/ui/skeleton";
import Fuse from 'fuse.js';
import { useDebounceValue } from "usehooks-ts";

export type IconData = typeof iconsData[number];

interface IconPickerProps {
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  children?: React.ReactNode;
  searchable?: boolean;
  searchPlaceholder?: string;
  triggerPlaceholder?: string;
  iconsList?: IconData[];
  categorized?: boolean;
  modal?: boolean;
}

const IconRenderer = React.memo(({ name }: { name: IconName }) => {
  // Try DynamicIcon first (more efficient)
  try {
    return <DynamicIcon name={name} className="size-5" />;
  } catch {
    // Fallback: use static import
    const IconComponent = (LucideIcons as any)[name];
    if (IconComponent) {
      return <IconComponent className="size-5" />;
    }
    return <div className="size-5" />;
  }
});
IconRenderer.displayName = "IconRenderer";

const IconsColumnSkeleton = () => {
  return (
    <div className="grid grid-cols-5 gap-2 p-2">
      {Array.from({ length: 40 }).map((_, i) => (
        <Skeleton key={i} className="h-10 w-10" />
      ))}
    </div>
  );
};

const useIconsData = () => {
  const [icons, setIcons] = useState<IconData[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;

    const loadIcons = async () => {
      setIsLoading(true);
      try {
        // Try to load from icons-data first
        try {
          const { iconsData } = await import('./icons-data');
          if (iconsData && iconsData.length > 0 && isMounted) {
            // Filter icons that exist in dynamic imports
            const { dynamicIconImports } = await import('lucide-react/dynamic');
            const availableIcons = iconsData.filter((icon: IconData) => {
              return icon.name in dynamicIconImports;
            });
            setIcons(availableIcons);
            setIsLoading(false);
            return;
          }
        } catch {
          // icons-data might be empty or not available, fall through to dynamic loading
        }

        // Fallback: dynamically generate icon list from lucide-react
        const { dynamicIconImports } = await import('lucide-react/dynamic');
        const generatedIcons: IconData[] = [];
        
        for (const iconName in dynamicIconImports) {
          generatedIcons.push({
            name: iconName,
            categories: [],
            tags: [iconName.toLowerCase()],
          });
        }

        if (isMounted) {
          setIcons(generatedIcons);
          setIsLoading(false);
        }
      } catch (error) {
        console.error('Failed to load icons:', error);
        if (isMounted) {
          setIcons([]);
          setIsLoading(false);
        }
      }
    };

    loadIcons();

    return () => {
      isMounted = false;
    };
  }, []);

  return { icons, isLoading };
};

const IconPicker = React.forwardRef<
  HTMLButtonElement,
  IconPickerProps
>(({
  value,
  defaultValue,
  onValueChange,
  open,
  defaultOpen,
  onOpenChange,
  children,
  searchable = true,
  searchPlaceholder = "Search for an icon...",
  triggerPlaceholder = "Select an icon",
  iconsList,
  categorized = true,
  modal = false,
  ...props
}, ref) => {
  const [selectedIcon, setSelectedIcon] = useState<string | undefined>(defaultValue);
  const [isOpen, setIsOpen] = useState(defaultOpen || false);
  const [search, setSearch] = useDebounceValue("", 100);
  const [isPopoverVisible, setIsPopoverVisible] = useState(false);
  const { icons } = useIconsData();
  const [isLoading, setIsLoading] = useState(true);

  const iconsToUse = useMemo(() => iconsList || icons, [iconsList, icons]);

  const fuseInstance = useMemo(() => {
    return new Fuse(iconsToUse, {
      keys: ['name', 'tags', 'categories'],
      threshold: 0.3,
      ignoreLocation: true,
      includeScore: true,
    });
  }, [iconsToUse]);

  const filteredIcons = useMemo(() => {
    if (search.trim() === "") {
      return iconsToUse;
    }

    const results = fuseInstance.search(search.toLowerCase().trim());
    return results.map(result => result.item);
  }, [search, iconsToUse, fuseInstance]);

  const categorizedIcons = useMemo(() => {
    if (!categorized || search.trim() !== "") {
      return [{ name: "All Icons", icons: filteredIcons }];
    }

    const categories = new Map<string, IconData[]>();

    filteredIcons.forEach(icon => {
      if (icon.categories && icon.categories.length > 0) {
        icon.categories.forEach(category => {
          if (!categories.has(category)) {
            categories.set(category, []);
          }
          categories.get(category)!.push(icon);
        });
      } else {
        const category = "Other";
        if (!categories.has(category)) {
          categories.set(category, []);
        }
        categories.get(category)!.push(icon);
      }
    });

    return Array.from(categories.entries())
      .map(([name, icons]) => ({ name, icons }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [filteredIcons, categorized, search]);

  const virtualItems = useMemo(() => {
    const items: Array<{
      type: 'category' | 'row';
      categoryIndex: number;
      rowIndex?: number;
      icons?: IconData[];
    }> = [];

    categorizedIcons.forEach((category, categoryIndex) => {
      items.push({ type: 'category', categoryIndex });

      const rows: IconData[][] = [];
      for (let i = 0; i < category.icons.length; i += 5) {
        rows.push(category.icons.slice(i, i + 5));
      }

      rows.forEach((rowIcons, rowIndex) => {
        items.push({
          type: 'row',
          categoryIndex,
          rowIndex,
          icons: rowIcons
        });
      });
    });

    return items;
  }, [categorizedIcons]);

  const categoryIndices = useMemo(() => {
    const indices: Record<string, number> = {};

    virtualItems.forEach((item, index) => {
      if (item.type === 'category') {
        indices[categorizedIcons[item.categoryIndex].name] = index;
      }
    });

    return indices;
  }, [virtualItems, categorizedIcons]);

  const parentRef = React.useRef<HTMLDivElement>(null);

  const virtualizer = useVirtualizer({
    count: virtualItems.length,
    getScrollElement: () => parentRef.current,
    estimateSize: (index) => virtualItems[index].type === 'category' ? 25 : 40,
    paddingEnd: 2,
    gap: 10,
    overscan: 5,
  });

  const handleValueChange = useCallback((icon: string) => {
    if (value === undefined) {
      setSelectedIcon(icon);
    }
    onValueChange?.(icon);
  }, [value, onValueChange]);

  const handleOpenChange = useCallback((newOpen: boolean) => {
    setSearch("");
    if (open === undefined) {
      setIsOpen(newOpen);
    }
    onOpenChange?.(newOpen);

    setIsPopoverVisible(newOpen);

    if (newOpen) {
      setTimeout(() => {
        virtualizer.measure();
        setIsLoading(false);
      }, 1);
    }
  }, [open, onOpenChange, virtualizer, setSearch]);

  const handleIconClick = useCallback((iconName: string) => {
    handleValueChange(iconName);
    setIsOpen(false);
    setSearch("");
  }, [handleValueChange, setSearch]);

  const handleSearchChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setSearch(e.target.value);

    if (parentRef.current) {
      parentRef.current.scrollTop = 0;
    }

    virtualizer.scrollToOffset(0);
  }, [virtualizer, setSearch]);

  const scrollToCategory = useCallback((categoryName: string) => {
    const categoryIndex = categoryIndices[categoryName];

    if (categoryIndex !== undefined && virtualizer) {
      virtualizer.scrollToIndex(categoryIndex, {
        align: 'start',
        behavior: 'smooth'
      });
    }
  }, [categoryIndices, virtualizer]);

  const categoryButtons = useMemo(() => {
    if (!categorized || search.trim() !== "") return null;

    return categorizedIcons.map(category => (
      <Button
        key={category.name}
        variant="ghost"
        size="sm"
        onClick={(e) => {
          e.stopPropagation();
          scrollToCategory(category.name);
        }}
      >
        {category.name.charAt(0).toUpperCase() + category.name.slice(1)}
      </Button>
    ));
  }, [categorizedIcons, scrollToCategory, categorized, search]);

  const renderIcon = useCallback((icon: IconData) => (
    <Tooltip key={icon.name}>
      <TooltipTrigger asChild>
        <button
          type="button"
          onClick={() => handleIconClick(icon.name)}
          className="flex items-center justify-center h-10 w-10 rounded-md hover:bg-accent transition-colors"
        >
          <IconRenderer name={icon.name as IconName} />
        </button>
      </TooltipTrigger>
      <TooltipContent>
        <p>{icon.name}</p>
      </TooltipContent>
    </Tooltip>
  ), [handleIconClick]);

  const renderVirtualContent = useCallback(() => {
    if (filteredIcons.length === 0) {
      return (
        <div className="text-center py-12 text-muted-foreground">
          No icon found
        </div>
      );
    }

    return (
      <div ref={parentRef} className="h-[400px] overflow-auto">
        <div
          style={{
            height: `${virtualizer.getTotalSize()}px`,
            width: '100%',
            position: 'relative',
          }}
        >
          {virtualizer.getVirtualItems().map((virtualItem: VirtualItem) => {
            const item = virtualItems[virtualItem.index];

            if (!item) return null;

            const itemStyle = {
              position: 'absolute' as const,
              top: 0,
              left: 0,
              width: '100%',
              height: `${virtualItem.size}px`,
              transform: `translateY(${virtualItem.start}px)`,
            };

            if (item.type === 'category') {
              return (
                <div key={`category-${item.categoryIndex}`} style={itemStyle} className="px-2 py-1 text-xs font-semibold text-muted-foreground">
                  {categorizedIcons[item.categoryIndex].name}
                </div>
              );
            }

            return (
              <div key={`row-${item.categoryIndex}-${item.rowIndex}`} style={itemStyle} className="grid grid-cols-5 gap-2 px-2">
                {item.icons!.map(renderIcon)}
              </div>
            );
          })}
        </div>
      </div>
    );
  }, [virtualizer, virtualItems, categorizedIcons, filteredIcons, renderIcon]);

  React.useEffect(() => {
    if (isPopoverVisible) {
      setIsLoading(true);
      const timer = setTimeout(() => {
        setIsLoading(false);
        virtualizer.measure();
      }, 10);

      const resizeObserver = new ResizeObserver(() => {
        virtualizer.measure();
      });

      if (parentRef.current) {
        resizeObserver.observe(parentRef.current);
      }

      return () => {
        clearTimeout(timer);
        resizeObserver.disconnect();
      };
    }
  }, [isPopoverVisible, virtualizer]);

  const currentValue = value || selectedIcon;
  const iconName = currentValue?.startsWith('lucide:') ? currentValue.replace('lucide:', '') : currentValue;

  return (
    <Popover open={open !== undefined ? open : isOpen} onOpenChange={handleOpenChange} modal={modal}>
      <PopoverTrigger asChild>
        {children || (
          <Button ref={ref} variant="outline" {...props}>
            {iconName ? (
              <>
                <IconRenderer name={iconName as IconName} />
                {iconName}
              </>
            ) : (
              triggerPlaceholder
            )}
          </Button>
        )}
      </PopoverTrigger>
      <PopoverContent className="w-[400px] p-0" align="start">
        <TooltipProvider>
          {searchable && (
            <div className="p-2 border-b">
              <Input
                placeholder={searchPlaceholder}
                value={search}
                onChange={handleSearchChange}
              />
            </div>
          )}
          {categorized && search.trim() === "" && (
            <div className="p-2 border-b flex flex-wrap gap-1">
              {categoryButtons}
            </div>
          )}

          {isLoading ? (
            <IconsColumnSkeleton />
          ) : (
            renderVirtualContent()
          )}
        </TooltipProvider>
      </PopoverContent>
    </Popover>
  );
});
IconPicker.displayName = "IconPicker";

export { IconPicker };
