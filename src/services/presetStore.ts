import type { WorkspacePreset } from '../types';

const STORAGE_KEY = 'doomvibing.layouts.v1';
const ACTIVE_LAYOUT_KEY = 'doomvibing.active_layout.v1';

export function loadUserLayouts(): WorkspacePreset[] {
  if (typeof localStorage === 'undefined') return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as WorkspacePreset[]) : [];
  } catch {
    return [];
  }
}

export function persistUserLayouts(layouts: WorkspacePreset[]): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(layouts));
  } catch {
    /* storage unavailable */
  }
}

export function loadActiveLayoutId(): string | null {
  if (typeof localStorage === 'undefined') return null;
  try {
    return localStorage.getItem(ACTIVE_LAYOUT_KEY);
  } catch {
    return null;
  }
}

export function persistActiveLayoutId(id: string): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(ACTIVE_LAYOUT_KEY, id);
  } catch {
    /* storage unavailable */
  }
}
