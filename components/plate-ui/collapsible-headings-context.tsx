'use client';

import * as React from 'react';

export interface CollapsedHeadingsContextValue {
  collapsed: Set<string>;
  toggle: (pathKey: string) => void;
}

const CollapsedHeadingsContext =
  React.createContext<CollapsedHeadingsContextValue | null>(null);

export function useCollapsedHeadings(): CollapsedHeadingsContextValue {
  const ctx = React.useContext(CollapsedHeadingsContext);
  if (!ctx) return { collapsed: new Set(), toggle: () => {} };
  return ctx;
}

export function CollapsedHeadingsProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [collapsed, setCollapsed] = React.useState<Set<string>>(new Set());
  const toggle = React.useCallback((pathKey: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(pathKey)) next.delete(pathKey);
      else next.add(pathKey);
      return next;
    });
  }, []);
  const value = React.useMemo(
    () => ({ collapsed, toggle }),
    [collapsed, toggle]
  );
  return (
    <CollapsedHeadingsContext.Provider value={value}>
      {children}
    </CollapsedHeadingsContext.Provider>
  );
}
