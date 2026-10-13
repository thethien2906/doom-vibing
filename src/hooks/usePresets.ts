import { useCallback, useState } from 'react';
import type { LayoutMode, WindowPane, WorkspacePreset } from '../types';
import { INITIAL_LAYOUTS, createBlankLayout } from '../lib/workspace';
import { loadUserLayouts, persistUserLayouts } from '../services/presetStore';

export interface UseLayouts {
  layouts: WorkspacePreset[];
  createLayout: (name: string) => WorkspacePreset;
  renameLayout: (id: string, name: string) => void;
  deleteLayout: (id: string) => void;
  updateLayoutContent: (id: string, layout: LayoutMode, windows: WindowPane[]) => void;
}

export function usePresets(): UseLayouts {
  const [layouts, setLayouts] = useState<WorkspacePreset[]>(() => {
    const saved = loadUserLayouts();
    if (saved.length > 0) return saved;
    return INITIAL_LAYOUTS;
  });

  const createLayout = useCallback((name: string): WorkspacePreset => {
    const blank = createBlankLayout(name);
    setLayouts((prev) => {
      const next = [...prev, blank];
      persistUserLayouts(next);
      return next;
    });
    return blank;
  }, []);

  const renameLayout = useCallback((id: string, name: string) => {
    const clean = name.trim();
    if (!clean) return;
    setLayouts((prev) => {
      const next = prev.map((l) => (l.id === id ? { ...l, name: clean } : l));
      persistUserLayouts(next);
      return next;
    });
  }, []);

  const deleteLayout = useCallback((id: string) => {
    setLayouts((prev) => {
      const next = prev.filter((l) => l.id !== id);
      persistUserLayouts(next);
      return next;
    });
  }, []);

  const updateLayoutContent = useCallback(
    (id: string, layout: LayoutMode, windows: WindowPane[]) => {
      setLayouts((prev) => {
        const next = prev.map((l) =>
          l.id === id
            ? {
                ...l,
                layout,
                windows: JSON.parse(JSON.stringify(windows)) as WindowPane[],
                updatedAt: new Date().toISOString(),
              }
            : l
        );
        persistUserLayouts(next);
        return next;
      });
    },
    []
  );

  return {
    layouts,
    createLayout,
    renameLayout,
    deleteLayout,
    updateLayoutContent,
  };
}
