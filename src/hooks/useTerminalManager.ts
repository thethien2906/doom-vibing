import { useCallback, useMemo, useState } from 'react';
import type { BroadcastMode, LayoutMode, TerminalTab, WindowPane } from '../types';
import { createTab, createWindow } from '../lib/workspace';

export interface InitialWorkspace {
  name: string;
  layout: LayoutMode;
  windows: WindowPane[];
}

export interface TerminalManager {
  workspaceName: string;
  layout: LayoutMode;
  windows: WindowPane[];
  focusedWindowId: string | null;
  maximizedWindowId: string | null;
  broadcastMode: BroadcastMode;
  broadcasting: boolean;
  totalTabs: number;
  totalSessions: number;
  allSessionIds: string[];

  setLayout: (layout: LayoutMode) => void;
  setWorkspaceName: (name: string) => void;
  applyWorkspace: (workspace: InitialWorkspace) => void;
  resetWorkspace: (workspace: InitialWorkspace) => void;

  addWindow: () => void;
  removeWindow: (windowId: string) => void;
  focusWindow: (windowId: string) => void;

  addTab: (windowId: string, title?: string) => void;
  closeTab: (windowId: string, tabId: string) => void;
  switchTab: (windowId: string, tabId: string) => void;
  renameTab: (windowId: string, tabId: string, title: string) => void;
  updateTab: (windowId: string, tabId: string, patch: Partial<TerminalTab>) => void;

  toggleMaximize: (windowId: string) => void;
  setBroadcastMode: (mode: BroadcastMode) => void;
  toggleBroadcasting: () => void;
  getBroadcastTargets: (sourceSessionId: string) => string[];
}

function nextTabTitle(window: WindowPane): string {
  return `tab ${window.tabs.length + 1}`;
}

export function useTerminalManager(initial: InitialWorkspace): TerminalManager {
  const [workspaceName, setWorkspaceName] = useState(initial.name);
  const [layout, setLayoutState] = useState<LayoutMode>(initial.layout);
  const [windows, setWindows] = useState<WindowPane[]>(initial.windows);
  const [focusedWindowId, setFocusedWindowId] = useState<string | null>(
    initial.windows[0]?.id ?? null
  );
  const [maximizedWindowId, setMaximizedWindowId] = useState<string | null>(null);
  const [broadcastMode, setBroadcastMode] = useState<BroadcastMode>('off');

  const focusWindow = useCallback((windowId: string) => {
    setFocusedWindowId(windowId);
  }, []);

  const setLayout = useCallback((next: LayoutMode) => {
    setLayoutState(next);
  }, []);

  const applyWorkspace = useCallback((workspace: InitialWorkspace) => {
    setWorkspaceName(workspace.name);
    setLayoutState(workspace.layout);
    setWindows(workspace.windows);
    setFocusedWindowId(workspace.windows[0]?.id ?? null);
    setMaximizedWindowId(null);
  }, []);

  const addWindow = useCallback(() => {
    setWindows((prev) => {
      const nextIndex = prev.length + 1;
      const win = createWindow({
        title: `Window ${nextIndex}`,
        tabs: [createTab({ title: 'tab 1' }), createTab({ title: 'tab 2' })],
      });
      setFocusedWindowId(win.id);
      return [...prev, win];
    });
  }, []);

  const removeWindow = useCallback((windowId: string) => {
    setWindows((prev) => {
      const next = prev.filter((w) => w.id !== windowId);
      setFocusedWindowId((current) => {
        if (current !== windowId) return current;
        return next[0]?.id ?? null;
      });
      setMaximizedWindowId((current) => (current === windowId ? null : current));
      return next;
    });
  }, []);

  const addTab = useCallback((windowId: string, title?: string) => {
    setWindows((prev) =>
      prev.map((win) => {
        if (win.id !== windowId) return win;
        const tab = createTab({ title: title ?? nextTabTitle(win) });
        return { ...win, tabs: [...win.tabs, tab], activeTabId: tab.id };
      })
    );
    setFocusedWindowId(windowId);
  }, []);

  const closeTab = useCallback((windowId: string, tabId: string) => {
    setWindows((prev) => {
      const next: WindowPane[] = [];
      for (const win of prev) {
        if (win.id !== windowId) {
          next.push(win);
          continue;
        }
        const tabs = win.tabs.filter((t) => t.id !== tabId);
        if (tabs.length === 0) continue; // closing last tab closes the window
        const activeTabId =
          win.activeTabId === tabId
            ? tabs[Math.max(0, win.tabs.findIndex((t) => t.id === tabId) - 1)].id
            : win.activeTabId;
        next.push({ ...win, tabs, activeTabId });
      }
      if (next.length === 0 || next.some((w) => w.id === windowId)) return next;
      setFocusedWindowId((current) => (current === windowId ? next[0]?.id ?? null : current));
      setMaximizedWindowId((current) => (current === windowId ? null : current));
      return next;
    });
    setFocusedWindowId((current) => current ?? windowId);
  }, []);

  const switchTab = useCallback((windowId: string, tabId: string) => {
    setWindows((prev) =>
      prev.map((win) => (win.id === windowId ? { ...win, activeTabId: tabId } : win))
    );
    setFocusedWindowId(windowId);
  }, []);

  const renameTab = useCallback((windowId: string, tabId: string, title: string) => {
    const clean = title.trim();
    if (!clean) return;
    setWindows((prev) =>
      prev.map((win) =>
        win.id === windowId
          ? {
              ...win,
              tabs: win.tabs.map((t) => (t.id === tabId ? { ...t, title: clean } : t)),
            }
          : win
      )
    );
  }, []);

  const updateTab = useCallback(
    (windowId: string, tabId: string, patch: Partial<TerminalTab>) => {
      setWindows((prev) =>
        prev.map((win) =>
          win.id === windowId
            ? {
                ...win,
                tabs: win.tabs.map((t) => (t.id === tabId ? { ...t, ...patch } : t)),
              }
            : win
        )
      );
    },
    []
  );

  const toggleMaximize = useCallback((windowId: string) => {
    setMaximizedWindowId((current) => (current === windowId ? null : windowId));
  }, []);

  const getBroadcastTargets = useCallback(
    (sourceSessionId: string): string[] => {
      if (broadcastMode === 'off') return [];

      let sourceTabIndex = -1;
      for (const w of windows) {
        const idx = w.tabs.findIndex((t) => t.sessionId === sourceSessionId);
        if (idx !== -1) {
          sourceTabIndex = idx;
          break;
        }
      }

      const targets: string[] = [];

      for (const w of windows) {
        if (broadcastMode === 'all') {
          for (const t of w.tabs) {
            if (t.sessionId && t.sessionId !== sourceSessionId) {
              targets.push(t.sessionId);
            }
          }
        } else if (broadcastMode === 'matching-tab') {
          if (sourceTabIndex !== -1 && w.tabs[sourceTabIndex]) {
            const sid = w.tabs[sourceTabIndex].sessionId;
            if (sid && sid !== sourceSessionId) targets.push(sid);
          }
        } else if (broadcastMode === 'active-tabs') {
          const active = w.tabs.find((t) => t.id === w.activeTabId);
          if (active?.sessionId && active.sessionId !== sourceSessionId) {
            targets.push(active.sessionId);
          }
        } else if (broadcastMode === 'tab-1') {
          const first = w.tabs[0];
          if (first?.sessionId && first.sessionId !== sourceSessionId) {
            targets.push(first.sessionId);
          }
        } else if (broadcastMode === 'tab-2') {
          const second = w.tabs[1];
          if (second?.sessionId && second.sessionId !== sourceSessionId) {
            targets.push(second.sessionId);
          }
        }
      }

      return targets;
    },
    [broadcastMode, windows]
  );

  const toggleBroadcasting = useCallback(() => {
    setBroadcastMode((curr) => (curr === 'off' ? 'matching-tab' : 'off'));
  }, []);

  const allSessionIds = useMemo(
    () => windows.flatMap((w) => w.tabs.map((t) => t.sessionId)).filter(Boolean),
    [windows]
  );

  const totalTabs = useMemo(
    () => windows.reduce((sum, w) => sum + w.tabs.length, 0),
    [windows]
  );

  return {
    workspaceName,
    layout,
    windows,
    focusedWindowId,
    maximizedWindowId,
    broadcastMode,
    broadcasting: broadcastMode !== 'off',
    totalTabs,
    totalSessions: allSessionIds.length,
    allSessionIds,

    setLayout,
    setWorkspaceName,
    applyWorkspace,
    resetWorkspace: applyWorkspace,

    addWindow,
    removeWindow,
    focusWindow,

    addTab,
    closeTab,
    switchTab,
    renameTab,
    updateTab,

    toggleMaximize,
    setBroadcastMode,
    toggleBroadcasting,
    getBroadcastTargets,
  };
}
