import React, { useEffect, useRef, useState } from 'react';
import { Plus, Radio, X } from 'lucide-react';
import type { BroadcastMode, TerminalTab } from '../types';
import { cn } from '../lib/cn';

interface TabBarProps {
  tabs: TerminalTab[];
  activeTabId: string;
  broadcastMode?: BroadcastMode;
  onSelect: (tabId: string) => void;
  onClose: (tabId: string) => void;
  onAdd: () => void;
  onRename: (tabId: string, title: string) => void;
}

export const TabBar: React.FC<TabBarProps> = ({
  tabs,
  activeTabId,
  broadcastMode = 'off',
  onSelect,
  onClose,
  onAdd,
  onRename,
}) => {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editingId && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editingId]);

  const commitRename = () => {
    if (editingId) onRename(editingId, draft);
    setEditingId(null);
  };

  return (
    <div className="flex h-full min-w-0 flex-1 items-center overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      {tabs.map((tab, index) => {
        const isActive = tab.id === activeTabId;
        const isBroadcastTarget =
          broadcastMode !== 'off' &&
          (broadcastMode === 'all' ||
            (broadcastMode === 'tab-1' && index === 0) ||
            (broadcastMode === 'tab-2' && index === 1) ||
            (broadcastMode === 'active-tabs' && isActive) ||
            (broadcastMode === 'matching-tab' && isActive));

        const dotClass =
          tab.status === 'exited'
            ? 'bg-accent-yellow'
            : isActive
              ? 'bg-accent-green'
              : 'bg-text-muted';

        return (
          <div
            key={tab.id}
            role="tab"
            aria-selected={isActive}
            onClick={() => onSelect(tab.id)}
            className={cn(
              'group relative flex h-9 shrink-0 cursor-pointer items-center gap-2 border-r border-dark-border px-3 text-xs transition-colors',
              isActive
                ? 'bg-dark-sidebar text-text-primary'
                : 'text-text-muted hover:bg-dark-hover hover:text-text-secondary'
            )}
          >
            <span className={cn('h-1.5 w-1.5 shrink-0 rounded-full', dotClass)} />

            {isBroadcastTarget && (
              <span title="Broadcast target">
                <Radio className="h-2.5 w-2.5 shrink-0 text-accent-yellow" />
              </span>
            )}

            {editingId === tab.id ? (
              <input
                ref={inputRef}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onBlur={commitRename}
                onClick={(e) => e.stopPropagation()}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') commitRename();
                  if (e.key === 'Escape') setEditingId(null);
                }}
                className="w-20 bg-transparent text-xs text-text-primary outline-none"
              />
            ) : (
              <span
                className="max-w-[150px] truncate"
                title="Double-click to rename"
                onDoubleClick={(e) => {
                  e.stopPropagation();
                  setEditingId(tab.id);
                  setDraft(tab.title);
                }}
              >
                {tab.title}
              </span>
            )}

            <button
              type="button"
              title="Close tab"
              onClick={(e) => {
                e.stopPropagation();
                onClose(tab.id);
              }}
              className="flex h-4 w-4 items-center justify-center rounded opacity-0 transition-opacity hover:bg-dark-subtle group-hover:opacity-70 hover:!opacity-100"
            >
              <X className="h-3 w-3" />
            </button>

            {isActive && (
              <span className="absolute inset-x-0 bottom-0 h-0.5 bg-accent-cyan" />
            )}
          </div>
        );
      })}

      <button
        type="button"
        title="New tab"
        onClick={onAdd}
        className="ml-1 flex h-6 w-6 shrink-0 items-center justify-center rounded text-text-muted transition-colors hover:bg-dark-hover hover:text-text-primary"
      >
        <Plus className="h-3.5 w-3.5" />
      </button>
    </div>
  );
};
