export type SplitOrientation = 'horizontal' | 'vertical';

export type BroadcastMode = 'off' | 'matching-tab' | 'active-tabs' | 'tab-1' | 'tab-2' | 'all';

export type TabStatus = 'active' | 'exited' | 'idle';

export interface TerminalTab {
  id: string;
  title: string;
  sessionId: string;
  cwd?: string;
  command?: string;
  status: TabStatus;
  exitCode?: number;
}

export interface WindowPane {
  id: string;
  title: string;
  tabs: TerminalTab[];
  activeTabId: string;
  flexBasis?: number;
}

export type LayoutMode = 'grid-2x2' | 'col-3' | 'col-2' | '1top-2bot' | 'custom';

export interface WorkspacePreset {
  id: string;
  name: string;
  layout: LayoutMode;
  windows: WindowPane[];
  createdAt: string;
  updatedAt: string;
}

export interface PtySpawnOptions {
  sessionId: string;
  cwd?: string;
  command?: string;
  cols: number;
  rows: number;
}

export interface WorkspaceMeta {
  name: string;
  layout: LayoutMode;
}
