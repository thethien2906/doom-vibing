import { useCallback, useEffect, useRef, useState } from 'react';
import { Sidebar } from './components/Sidebar';
import { TopToolbar } from './components/TopToolbar';
import { WindowGrid } from './components/WindowGrid';
import { useTerminalManager } from './hooks/useTerminalManager';
import { usePresets } from './hooks/usePresets';
import { cloneLayoutWindows } from './lib/workspace';
import { loadActiveLayoutId, persistActiveLayoutId } from './services/presetStore';
import { getPtyCwd, writePty } from './services/ptyApi';
import type { WorkspacePreset } from './types';

export default function App() {
  const { layouts, layoutsRef, createLayout, renameLayout, deleteLayout, updateLayoutContent } = usePresets();

  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [activeLayoutId, setActiveLayoutId] = useState<string>(() => {
    const savedActiveId = loadActiveLayoutId();
    if (savedActiveId && layouts.some((l) => l.id === savedActiveId)) {
      return savedActiveId;
    }
    return layouts[0]?.id ?? 'layout-default';
  });

  const currentLayout = layouts.find((l) => l.id === activeLayoutId) ?? layouts[0];

  const manager = useTerminalManager({
    name: currentLayout?.name ?? 'Default',
    layout: currentLayout?.layout ?? 'grid-2x2',
    windows: cloneLayoutWindows(currentLayout?.windows ?? []),
  });

  const managerRef = useRef(manager);
  managerRef.current = manager;

  const activeIdRef = useRef(activeLayoutId);
  activeIdRef.current = activeLayoutId;

  const isSwitchingRef = useRef(false);

  // Persist current layout changes immediately
  const syncCurrentToStore = useCallback(async () => {
    const currentId = activeIdRef.current;
    if (!currentId) return;
    const currentWindows = managerRef.current.windows;
    for (const win of currentWindows) {
      for (const tab of win.tabs) {
        if (tab.status === 'active' && tab.sessionId) {
          const cwd = await getPtyCwd(tab.sessionId);
          if (cwd) {
            tab.cwd = cwd;
          }
        }
      }
    }
    updateLayoutContent(currentId, managerRef.current.layout, currentWindows);
  }, [updateLayoutContent]);

  // Auto-persist active layout whenever windows or layout mode changes (adding/closing tabs, windows, etc.)
  useEffect(() => {
    if (isSwitchingRef.current) return;
    if (!activeLayoutId) return;
    updateLayoutContent(activeLayoutId, manager.layout, manager.windows);
  }, [activeLayoutId, manager.layout, manager.windows, updateLayoutContent]);

  // Switch layout
  const handleSelectLayout = useCallback(
    async (target: WorkspacePreset) => {
      if (target.id === activeIdRef.current) return;

      // 1. Immediately save current layout with latest state and CWDs
      await syncCurrentToStore();

      // 2. Mark switching in progress
      isSwitchingRef.current = true;

      // 3. Find freshest version of target layout from ref (containing all added tabs)
      const freshest = layoutsRef.current?.find((l) => l.id === target.id) ?? target;

      // 4. Apply workspace to manager
      managerRef.current.applyWorkspace({
        name: freshest.name,
        layout: freshest.layout,
        windows: cloneLayoutWindows(freshest.windows),
      });

      // 5. Update active layout ID and persist it
      setActiveLayoutId(freshest.id);
      persistActiveLayoutId(freshest.id);

      // 6. Reset switching flag after React paint
      setTimeout(() => {
        isSwitchingRef.current = false;
      }, 50);
    },
    [syncCurrentToStore, layoutsRef]
  );

  // Create new blank layout
  const handleCreateLayout = useCallback(
    async (name: string) => {
      await syncCurrentToStore();
      isSwitchingRef.current = true;
      const blank = createLayout(name);
      managerRef.current.applyWorkspace({
        name: blank.name,
        layout: blank.layout,
        windows: [],
      });
      setActiveLayoutId(blank.id);
      persistActiveLayoutId(blank.id);
      setTimeout(() => {
        isSwitchingRef.current = false;
      }, 50);
    },
    [createLayout, syncCurrentToStore]
  );

  // Rename layout
  const handleRenameLayout = useCallback(
    (id: string, name: string) => {
      renameLayout(id, name);
      if (id === activeIdRef.current) {
        managerRef.current.setWorkspaceName(name);
      }
    },
    [renameLayout]
  );

  // Delete layout
  const handleDeleteLayout = useCallback(
    (id: string) => {
      deleteLayout(id);
      if (id === activeIdRef.current) {
        const remaining = layouts.filter((l) => l.id !== id);
        if (remaining[0]) {
          handleSelectLayout(remaining[0]);
        }
      }
    },
    [deleteLayout, layouts, handleSelectLayout]
  );

  const handleTabSpawned = useCallback((windowId: string, tabId: string) => {
    managerRef.current.updateTab(windowId, tabId, { status: 'active' });
  }, []);

  const handleTabExit = useCallback((windowId: string, tabId: string, code: number) => {
    managerRef.current.updateTab(windowId, tabId, { status: 'exited', exitCode: code });
  }, []);

  const handleCwdChange = useCallback((sessionId: string, cwd: string) => {
    managerRef.current.updateTabCwd(sessionId, cwd);
  }, []);

  // Broadcast router
  const handleBroadcast = useCallback((sourceSessionId: string, data: string) => {
    const targets = managerRef.current.getBroadcastTargets(sourceSessionId);
    for (const targetId of targets) {
      void writePty(targetId, data);
    }
  }, []);

  // Keyboard shortcuts
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey;
      if (!mod) return;
      const key = e.key.toLowerCase();

      // Ctrl+B: Toggle Layouts Sidebar
      if (!e.shiftKey && key === 'b') {
        e.preventDefault();
        setSidebarOpen((v) => !v);
        return;
      }

      if (!e.shiftKey) return;
      const m = managerRef.current;
      const focusedId = m.focusedWindowId;

      if (key === 't' && focusedId) {
        e.preventDefault();
        m.addTab(focusedId);
      } else if (key === 'w' && focusedId) {
        e.preventDefault();
        const win = m.windows.find((w) => w.id === focusedId);
        if (win) m.closeTab(focusedId, win.activeTabId);
      } else if (key === 'n') {
        e.preventDefault();
        m.addWindow();
      } else if (key === 'b') {
        e.preventDefault();
        m.toggleBroadcasting();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  // Auto-save on window unmount/close
  useEffect(() => {
    const onBeforeUnload = () => syncCurrentToStore();
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [syncCurrentToStore]);

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-dark-base font-sans text-text-primary antialiased">
      <Sidebar
        isOpen={sidebarOpen}
        onToggle={() => setSidebarOpen((v) => !v)}
        layouts={layouts}
        activeLayoutId={activeLayoutId}
        onSelectLayout={handleSelectLayout}
        onCreateLayout={handleCreateLayout}
        onRenameLayout={handleRenameLayout}
        onDeleteLayout={handleDeleteLayout}
      />

      <main className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <TopToolbar
          sidebarOpen={sidebarOpen}
          onToggleSidebar={() => setSidebarOpen((v) => !v)}
          workspaceName={manager.workspaceName}
          broadcastMode={manager.broadcastMode}
          onSetBroadcastMode={manager.setBroadcastMode}
          onAddWindow={manager.addWindow}
        />

        <WindowGrid
          windows={manager.windows}
          layout={manager.layout}
          focusedWindowId={manager.focusedWindowId}
          maximizedWindowId={manager.maximizedWindowId}
          broadcastMode={manager.broadcastMode}
          onFocusWindow={manager.focusWindow}
          onToggleMaximize={manager.toggleMaximize}
          onCloseWindow={manager.removeWindow}
          onSelectTab={manager.switchTab}
          onCloseTab={manager.closeTab}
          onAddTab={manager.addTab}
          onRenameTab={manager.renameTab}
          onTabSpawned={handleTabSpawned}
          onTabExit={handleTabExit}
          onBroadcast={handleBroadcast}
          onCwdChange={handleCwdChange}
          onAddWindow={manager.addWindow}
        />
      </main>
    </div>
  );
}
