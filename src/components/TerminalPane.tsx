import React from 'react';
import { Maximize2, Minimize2, X } from 'lucide-react';
import type { BroadcastMode, WindowPane } from '../types';
import { cn } from '../lib/cn';
import { TabBar } from './TabBar';
import { TerminalView } from './TerminalView';

interface TerminalPaneProps {
  pane: WindowPane;
  focused: boolean;
  maximized: boolean;
  broadcastMode: BroadcastMode;
  onFocus: () => void;
  onToggleMaximize: () => void;
  onCloseWindow: () => void;
  onSelectTab: (tabId: string) => void;
  onCloseTab: (tabId: string) => void;
  onAddTab: () => void;
  onRenameTab: (tabId: string, title: string) => void;
  onTabSpawned: (tabId: string) => void;
  onTabExit: (tabId: string, code: number) => void;
  onBroadcast: (sourceSessionId: string, data: string) => void;
  onCwdChange?: (sessionId: string, cwd: string) => void;
}

export const TerminalPane: React.FC<TerminalPaneProps> = ({
  pane,
  focused,
  maximized,
  broadcastMode,
  onFocus,
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
}) => {
  return (
    <section
      onMouseDown={onFocus}
      className={cn(
        'relative flex min-h-0 min-w-0 flex-col overflow-hidden rounded-md border bg-dark-sidebar shadow-[0_4px_16px_rgba(0,0,0,0.35)] transition-colors duration-150',
        focused ? 'border-[#444444]' : 'border-dark-border',
        maximized && 'pane-maximized'
      )}
    >
      <header className="flex h-9 shrink-0 items-center justify-between border-b border-dark-border bg-[#141414] pr-1.5">
        <TabBar
          tabs={pane.tabs}
          activeTabId={pane.activeTabId}
          broadcastMode={broadcastMode}
          onSelect={onSelectTab}
          onClose={onCloseTab}
          onAdd={onAddTab}
          onRename={onRenameTab}
        />

        <div className="flex shrink-0 items-center gap-0.5">
          <button
            type="button"
            title={maximized ? 'Restore window' : 'Maximize window'}
            onClick={(e) => {
              e.stopPropagation();
              onToggleMaximize();
            }}
            className="win-btn"
          >
            {maximized ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
          </button>
          <button
            type="button"
            title="Close window"
            onClick={(e) => {
              e.stopPropagation();
              onCloseWindow();
            }}
            className="win-btn"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      </header>

      <div className="relative min-h-0 flex-1">
        {pane.tabs.map((tab) => {
          const isActive = tab.id === pane.activeTabId;
          return (
            <div
              key={tab.id}
              className={cn(
                'absolute inset-0',
                isActive
                  ? 'visible z-10 opacity-100'
                  : 'invisible -z-10 opacity-0 pointer-events-none'
              )}
            >
              <TerminalView
                sessionId={tab.sessionId}
                cwd={tab.cwd}
                command={tab.command}
                active={isActive}
                onBroadcast={onBroadcast}
                onCwdChange={onCwdChange}
                onSpawned={() => onTabSpawned(tab.id)}
                onExit={(code) => onTabExit(tab.id, code)}
              />
            </div>
          );
        })}
      </div>
    </section>
  );
};
