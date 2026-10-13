import { useCallback, useEffect, useRef, useState } from 'react';
import { Sidebar } from './components/Sidebar';
import { TopToolbar } from './components/TopToolbar';
import { WindowGrid } from './components/WindowGrid';
import { useTerminalManager } from './hooks/useTerminalManager';
import { usePresets } from './hooks/usePresets';
import { cloneLayoutWindows } from './lib/workspace';
import { writePty } from './services/ptyApi';
import type { WorkspacePreset } from './types';

export default function App() {
  const { layouts, createLayout, renameLayout, deleteLayout, updateLayoutContent } = usePresets();

  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [activeLayoutId, setActiveLayoutId] = useState<string>(() => layouts[0]?.id ?? 'layout-default');

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

  // Persist current layout changes
  const syncCurrentToStore = useCallback(() => {
    const currentId = activeIdRef.current;
    if (currentId) {
      updateLayoutContent(currentId, managerRef.current.layout, managerRef.current.windows);
    }
  }, [updateLayoutContent]);

  // Switch layout
  const handleSelectLayout = useCallback(
    (target: WorkspacePreset) => {
      if (target.id === activeIdRef.current) return;
      syncCurrentToStore();
      managerRef.current.applyWorkspace({
        name: target.name,
        layout: target.layout,
        windows: cloneLayoutWindows(target.windows),
      });
      setActiveLayoutId(target.id);
    },
    [syncCurrentToStore]
  );

  // Create new blank layout
  const handleCreateLayout = useCallback(
    (name: string) => {
      syncCurrentToStore();
      const blank = createLayout(name);
      managerRef.current.applyWorkspace({
        name: blank.name,
        layout: blank.layout,
        windows: [],
      });
      setActiveLayoutId(blank.id);
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
          onAddWindow={manager.addWindow}
        />
      </main>
    </div>
  );
}
