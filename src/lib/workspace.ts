import type { TerminalTab, WindowPane, WorkspacePreset } from '../types';
import { newId } from './id';

export function createTab(overrides: Partial<TerminalTab> = {}): TerminalTab {
  const id = overrides.id ?? newId('tab');
  return {
    id,
    sessionId: overrides.sessionId ?? newId('pty'),
    title: overrides.title ?? 'tab 1',
    cwd: overrides.cwd,
    command: overrides.command,
    status: overrides.status ?? 'idle',
    exitCode: overrides.exitCode,
  };
}

export function createWindow(overrides: Partial<WindowPane> = {}): WindowPane {
  const tabs = overrides.tabs ?? [
    createTab({ title: 'tab 1' }),
    createTab({ title: 'tab 2' }),
  ];
  const id = overrides.id ?? newId('win');
  return {
    id,
    title: overrides.title ?? 'Window',
    tabs,
    activeTabId: overrides.activeTabId ?? tabs[0]?.id ?? '',
    flexBasis: overrides.flexBasis,
  };
}

const now = () => new Date().toISOString();

export function createDefaultWindows(): WindowPane[] {
  return [
    createWindow({
      title: 'Window 1',
      tabs: [createTab({ title: 'tab 1' }), createTab({ title: 'tab 2' })],
    }),
    createWindow({
      title: 'Window 2',
      tabs: [createTab({ title: 'tab 1' }), createTab({ title: 'tab 2' })],
    }),
    createWindow({
      title: 'Window 3',
      tabs: [createTab({ title: 'tab 1' }), createTab({ title: 'tab 2' })],
    }),
    createWindow({
      title: 'Window 4',
      tabs: [createTab({ title: 'tab 1' }), createTab({ title: 'tab 2' })],
    }),
  ];
}

export const INITIAL_LAYOUTS: WorkspacePreset[] = [
  {
    id: 'layout-default',
    name: 'Default',
    layout: 'grid-2x2',
    createdAt: now(),
    updatedAt: now(),
    windows: createDefaultWindows(),
  },
];

export function createBlankLayout(name: string): WorkspacePreset {
  const timestamp = now();
  return {
    id: newId('layout'),
    name: name.trim() || 'New Layout',
    layout: 'grid-2x2',
    windows: [],
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

export function cloneLayoutWindows(windows: WindowPane[]): WindowPane[] {
  if (!windows || windows.length === 0) return [];
  return windows.map((win) => {
    const tabs = (win.tabs ?? []).map((tab) =>
      createTab({ title: tab.title, cwd: tab.cwd, command: tab.command })
    );
    const activeIndex = Math.max(
      0,
      win.tabs?.findIndex((t) => t.id === win.activeTabId) ?? 0
    );
    const activeTabId = tabs[activeIndex]?.id ?? tabs[0]?.id ?? '';
    return createWindow({
      title: win.title,
      flexBasis: win.flexBasis,
      tabs: tabs.length > 0 ? tabs : undefined,
      activeTabId,
    });
  });
}
