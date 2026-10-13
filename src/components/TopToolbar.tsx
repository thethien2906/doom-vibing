import React, { useEffect, useRef, useState } from 'react';
import { ChevronDown, PanelLeft, Plus, Radio } from 'lucide-react';
import type { BroadcastMode } from '../types';
import { cn } from '../lib/cn';

interface TopToolbarProps {
  sidebarOpen: boolean;
  onToggleSidebar: () => void;
  workspaceName: string;
  broadcastMode: BroadcastMode;
  onSetBroadcastMode: (mode: BroadcastMode) => void;
  onAddWindow: () => void;
}

const BROADCAST_OPTIONS: Array<{
  id: BroadcastMode;
  label: string;
  desc: string;
}> = [
  { id: 'off', label: 'Off', desc: 'Broadcast disabled' },
  { id: 'matching-tab', label: 'Matching Tab', desc: 'Same tab index across windows (Tab 1 → Tab 1, Tab 2 → Tab 2)' },
  { id: 'active-tabs', label: 'Active Tabs', desc: 'Visible tab in each window' },
  { id: 'tab-1', label: 'Tab 1 Only', desc: 'First tab of all windows (e.g. Codex)' },
  { id: 'tab-2', label: 'Tab 2 Only', desc: 'Second tab of all windows (e.g. Claude Code)' },
  { id: 'all', label: 'All Tabs', desc: 'Every tab in every window' },
];

export const TopToolbar: React.FC<TopToolbarProps> = ({
  sidebarOpen,
  onToggleSidebar,
  workspaceName,
  broadcastMode,
  onSetBroadcastMode,
  onAddWindow,
}) => {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    if (menuOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [menuOpen]);

  const currentOption = BROADCAST_OPTIONS.find((o) => o.id === broadcastMode) ?? BROADCAST_OPTIONS[0];
  const isActive = broadcastMode !== 'off';

  return (
    <header className="flex h-12 shrink-0 items-center justify-between border-b border-dark-border bg-dark-sidebar px-6 select-none">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onToggleSidebar}
          title={sidebarOpen ? 'Hide Layouts (Ctrl+B)' : 'Show Layouts (Ctrl+B)'}
          className="rounded p-1 text-text-muted transition-colors hover:bg-dark-hover hover:text-text-primary"
        >
          <PanelLeft className="h-4 w-4" />
        </button>
        <h1 className="text-base font-semibold tracking-tight text-text-primary">
          {workspaceName}
        </h1>
      </div>

      <div className="flex items-center gap-2">
        {/* Targeted Broadcast Dropdown */}
        <div ref={menuRef} className="relative">
          <button
            type="button"
            onClick={() => setMenuOpen((o) => !o)}
            title="Configure broadcast scope"
            className={cn(
              'flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs transition-colors',
              isActive
                ? 'border-accent-yellow bg-dark-active text-accent-yellow font-medium'
                : 'border-dark-border text-text-secondary hover:border-dark-subtle hover:bg-dark-hover hover:text-text-primary'
            )}
          >
            <Radio className="h-3.5 w-3.5" />
            <span>
              {broadcastMode === 'off' ? 'Broadcast: Off' : `Broadcast: ${currentOption.label}`}
            </span>
            <ChevronDown className="h-3 w-3 opacity-60" />
          </button>

          {menuOpen && (
            <div className="absolute right-0 top-full mt-1.5 w-72 rounded-md border border-dark-subtle bg-[#1c1c1c] p-1 shadow-2xl z-50">
              <div className="px-2.5 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-text-muted">
                Broadcast Target Scope
              </div>
              <div className="space-y-0.5">
                {BROADCAST_OPTIONS.map((opt) => {
                  const isSelected = opt.id === broadcastMode;
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => {
                        onSetBroadcastMode(opt.id);
                        setMenuOpen(false);
                      }}
                      className={cn(
                        'flex w-full flex-col items-start rounded px-2.5 py-1.5 text-left transition-colors',
                        isSelected
                          ? 'bg-dark-active text-accent-yellow'
                          : 'text-text-secondary hover:bg-dark-hover hover:text-text-primary'
                      )}
                    >
                      <span className="text-xs font-medium">{opt.label}</span>
                      <span className="text-[11px] text-text-muted">{opt.desc}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        <button
          type="button"
          onClick={onAddWindow}
          title="Add a new terminal window"
          className="flex items-center gap-1.5 rounded-md border border-dark-border px-2.5 py-1 text-xs text-text-secondary transition-colors hover:border-dark-subtle hover:bg-dark-hover hover:text-text-primary"
        >
          <Plus className="h-3.5 w-3.5" />
          <span>Window</span>
        </button>
      </div>
    </header>
  );
};
