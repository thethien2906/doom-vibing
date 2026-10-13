import React, { useEffect, useRef, useState } from 'react';
import { Check, Edit2, LayoutGrid, PanelLeftClose, Plus, Trash2, X } from 'lucide-react';
import type { WorkspacePreset } from '../types';
import { cn } from '../lib/cn';

interface SidebarProps {
  isOpen: boolean;
  onToggle: () => void;
  layouts: WorkspacePreset[];
  activeLayoutId: string | null;
  onSelectLayout: (layout: WorkspacePreset) => void;
  onCreateLayout: (name: string) => void;
  onRenameLayout: (id: string, name: string) => void;
  onDeleteLayout: (id: string) => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  isOpen,
  onToggle,
  layouts,
  activeLayoutId,
  onSelectLayout,
  onCreateLayout,
  onRenameLayout,
  onDeleteLayout,
}) => {
  const [isAdding, setIsAdding] = useState(false);
  const [newLayoutName, setNewLayoutName] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const addInputRef = useRef<HTMLInputElement>(null);
  const editInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isAdding && addInputRef.current) {
      addInputRef.current.focus();
    }
  }, [isAdding]);

  useEffect(() => {
    if (editingId !== null && editInputRef.current) {
      editInputRef.current.focus();
      editInputRef.current.select();
    }
  }, [editingId]);

  const handleStartAdd = () => {
    setIsAdding(true);
    setNewLayoutName('');
  };

  const handleCancelAdd = () => {
    setIsAdding(false);
    setNewLayoutName('');
  };

  const handleCreateSubmit = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const trimmed = newLayoutName.trim();
    if (!trimmed) {
      setIsAdding(false);
      return;
    }
    onCreateLayout(trimmed);
    setNewLayoutName('');
    setIsAdding(false);
  };

  const handleStartRename = (layout: WorkspacePreset, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingId(layout.id);
    setEditingName(layout.name);
  };

  const handleRenameSubmit = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (editingId === null) return;
    const trimmed = editingName.trim();
    if (trimmed && trimmed !== layouts.find((l) => l.id === editingId)?.name) {
      onRenameLayout(editingId, trimmed);
    }
    setEditingId(null);
  };

  const handleDeleteConfirm = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    onDeleteLayout(id);
    setDeletingId(null);
  };

  return (
    <aside
      className={cn(
        'flex h-full shrink-0 flex-col select-none border-r border-dark-border bg-dark-sidebar transition-all duration-150 ease-in-out overflow-hidden',
        isOpen ? 'w-64' : 'w-0 border-r-0'
      )}
    >
      <div className="flex h-full w-64 flex-col">
        {/* App Header */}
        <div className="flex items-center justify-between border-b border-dark-border px-5 py-5">
          <span className="text-base font-semibold tracking-tight text-text-primary">
            doom-vibing
          </span>
          <button
            type="button"
            onClick={onToggle}
            title="Hide Sidebar (Ctrl+B)"
            className="rounded p-1 text-text-muted transition-colors hover:bg-dark-hover hover:text-text-primary"
          >
            <PanelLeftClose className="h-4 w-4" />
          </button>
        </div>

      {/* Main Navigation */}
      <div className="flex-1 overflow-y-auto p-3">
        {/* Section: Layouts */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between px-3 text-[11px] font-medium uppercase tracking-wider text-text-muted">
            <span>Layouts</span>
            <button
              type="button"
              onClick={handleStartAdd}
              title="New Blank Layout"
              className="rounded p-1 text-text-secondary transition-colors hover:bg-dark-hover hover:text-text-primary"
            >
              <Plus className="h-3.5 w-3.5" />
            </button>
          </div>

          {/* Inline Add Input */}
          {isAdding && (
            <form onSubmit={handleCreateSubmit} className="px-1 py-1">
              <div className="flex items-center gap-1.5 rounded-md border border-dark-subtle bg-[#202020] px-2.5 py-1.5">
                <LayoutGrid className="h-3.5 w-3.5 shrink-0 text-text-muted" />
                <input
                  ref={addInputRef}
                  type="text"
                  placeholder="Layout name..."
                  value={newLayoutName}
                  onChange={(e) => setNewLayoutName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Escape') handleCancelAdd();
                  }}
                  onBlur={() => {
                    if (!newLayoutName.trim()) setIsAdding(false);
                  }}
                  className="w-full bg-transparent text-xs text-text-primary outline-none placeholder:text-text-muted"
                />
                <button
                  type="submit"
                  className="p-0.5 text-text-muted hover:text-text-primary"
                >
                  <Check className="h-3 w-3" />
                </button>
                <button
                  type="button"
                  onClick={handleCancelAdd}
                  className="p-0.5 text-text-muted hover:text-text-primary"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            </form>
          )}

          {/* Layout List */}
          <div className="space-y-0.5">
            {layouts.length === 0 && !isAdding ? (
              <div className="px-3 py-3 text-center text-xs text-text-faint">
                No layouts yet
              </div>
            ) : (
              layouts.map((layout) => {
                const isActive = layout.id === activeLayoutId;
                const isEditing = editingId === layout.id;
                const isDeleting = deletingId === layout.id;

                if (isEditing) {
                  return (
                    <form
                      key={layout.id}
                      onSubmit={handleRenameSubmit}
                      className="px-1 py-0.5"
                    >
                      <div className="flex items-center gap-1.5 rounded-md border border-dark-subtle bg-[#202020] px-2.5 py-1.5">
                        <input
                          ref={editInputRef}
                          type="text"
                          value={editingName}
                          onChange={(e) => setEditingName(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Escape') setEditingId(null);
                          }}
                          onBlur={handleRenameSubmit}
                          className="w-full bg-transparent text-xs text-text-primary outline-none"
                        />
                        <button
                          type="submit"
                          className="text-text-muted hover:text-text-primary"
                        >
                          <Check className="h-3 w-3" />
                        </button>
                      </div>
                    </form>
                  );
                }

                if (isDeleting) {
                  return (
                    <div
                      key={layout.id}
                      className="flex items-center justify-between rounded-md border border-red-800/40 bg-red-950/40 px-3 py-1.5 text-xs text-red-300"
                    >
                      <span>Delete?</span>
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={(e) => handleDeleteConfirm(layout.id, e)}
                          className="px-1 font-medium text-red-200 hover:underline"
                        >
                          Yes
                        </button>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setDeletingId(null);
                          }}
                          className="px-1 text-text-muted hover:text-text-primary"
                        >
                          No
                        </button>
                      </div>
                    </div>
                  );
                }

                return (
                  <div
                    key={layout.id}
                    onClick={() => onSelectLayout(layout)}
                    className={cn(
                      'group flex cursor-pointer items-center justify-between rounded-md px-3 py-2 text-sm transition-colors duration-150',
                      isActive
                        ? 'bg-dark-active font-medium text-text-primary'
                        : 'text-text-secondary hover:bg-dark-hover'
                    )}
                  >
                    <div className="flex min-w-0 flex-1 items-center gap-2.5">
                      <LayoutGrid className="h-4 w-4 shrink-0 stroke-[1.75] text-text-muted" />
                      <span className="truncate">{layout.name}</span>
                    </div>

                    <div className="flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                      <button
                        type="button"
                        onClick={(e) => handleStartRename(layout, e)}
                        title="Rename"
                        className="rounded p-1 text-text-muted transition-colors hover:bg-[#303030] hover:text-text-primary"
                      >
                        <Edit2 className="h-3 w-3" />
                      </button>
                      {layouts.length > 1 && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setDeletingId(layout.id);
                          }}
                          title="Delete"
                          className="rounded p-1 text-text-muted transition-colors hover:bg-[#303030] hover:text-red-400"
                        >
                          <Trash2 className="h-3 w-3" />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
      </div>
    </aside>
  );
};
