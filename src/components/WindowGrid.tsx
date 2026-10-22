import React from 'react';
import { Plus } from 'lucide-react';
import type { BroadcastMode, LayoutMode, WindowPane } from '../types';
import { cn } from '../lib/cn';
import { TerminalPane } from './TerminalPane';

function resolveGridClass(_layout: LayoutMode, count: number): string {
  if (count <= 1) return 'layout-col-1';
  if (count === 2) return 'layout-col-2';
  if (count === 3) return 'layout-1top-2bot';
  if (count === 4) return 'layout-grid-2x2';
  return 'layout-grid-auto';
}

interface WindowGridProps {
  windows: WindowPane[];
  layout: LayoutMode;
  focusedWindowId: string | null;
  maximizedWindowId: string | null;
  broadcastMode: BroadcastMode;
  onFocusWindow: (windowId: string) => void;
  onToggleMaximize: (windowId: string) => void;
  onCloseWindow: (windowId: string) => void;
  onSelectTab: (windowId: string, tabId: string) => void;
  onCloseTab: (windowId: string, tabId: string) => void;
  onAddTab: (windowId: string) => void;
  onRenameTab: (windowId: string, tabId: string, title: string) => void;
  onTabSpawned: (windowId: string, tabId: string) => void;
  onTabExit: (windowId: string, tabId: string, code: number) => void;
  onBroadcast: (sourceSessionId: string, data: string) => void;
  onCwdChange?: (sessionId: string, cwd: string) => void;
  onAddWindow: () => void;
}

export const WindowGrid: React.FC<WindowGridProps> = ({
  windows,
  layout,
  focusedWindowId,
  maximizedWindowId,
  broadcastMode,
  onFocusWindow,
  onToggleMaximize,
  onCloseWindow,
  onSelectTab,
  onCloseTab,
  onAddTab,
  onRenameTab,
  onTabSpawned,
  onTabExit,
  onBroadcast,
  onCwdChange,
  onAddWindow,
}) => {
  if (windows.length === 0) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 select-none text-text-muted">
        <p className="text-xs text-text-faint">Blank layout</p>
        <button
          type="button"
          onClick={onAddWindow}
          className="flex items-center gap-1.5 rounded-md border border-dark-subtle px-3 py-1.5 text-xs text-text-secondary transition-colors hover:bg-dark-hover hover:text-text-primary"
        >
          <Plus className="h-3.5 w-3.5" />
          <span>Add Window</span>
        </button>
      </div>
    );
  }

  return (
    <div
      className={cn(
        'grid min-h-0 flex-1 gap-2 overflow-hidden p-2 transition-all duration-150',
        resolveGridClass(layout, windows.length)
      )}
    >
      {windows.map((pane) => (
        <TerminalPane
          key={pane.id}
          pane={pane}
          focused={focusedWindowId === pane.id}
          maximized={maximizedWindowId === pane.id}
          broadcastMode={broadcastMode}
          onFocus={() => onFocusWindow(pane.id)}
          onToggleMaximize={() => onToggleMaximize(pane.id)}
          onCloseWindow={() => onCloseWindow(pane.id)}
          onSelectTab={(tabId) => onSelectTab(pane.id, tabId)}
          onCloseTab={(tabId) => onCloseTab(pane.id, tabId)}
          onAddTab={() => onAddTab(pane.id)}
          onRenameTab={(tabId, title) => onRenameTab(pane.id, tabId, title)}
          onTabSpawned={(tabId) => onTabSpawned(pane.id, tabId)}
          onTabExit={(tabId, code) => onTabExit(pane.id, tabId, code)}
          onBroadcast={onBroadcast}
          onCwdChange={onCwdChange}
        />
      ))}
    </div>
  );
};
