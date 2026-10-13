import type { ITheme } from '@xterm/xterm';

/**
 * Dark terminal palette aligned with the erwining minimalist design standard.
 */
export const TERMINAL_THEME: ITheme = {
  background: '#121212',
  foreground: '#d1d5db',
  cursor: '#ffffff',
  cursorAccent: '#121212',
  selectionBackground: 'rgba(56, 189, 248, 0.30)',
  selectionForeground: '#ffffff',

  black: '#2a2a2a',
  red: '#f87171',
  green: '#4ade80',
  yellow: '#facc15',
  blue: '#60a5fa',
  magenta: '#c084fc',
  cyan: '#38bdf8',
  white: '#ededed',

  brightBlack: '#525252',
  brightRed: '#fca5a5',
  brightGreen: '#86efac',
  brightYellow: '#fde047',
  brightBlue: '#93c5fd',
  brightMagenta: '#d8b4fe',
  brightCyan: '#7dd3fc',
  brightWhite: '#ffffff',
};

export const TERMINAL_FONT_FAMILY =
  '"JetBrains Mono", "Fira Code", ui-monospace, Menlo, Monaco, Consolas, "Courier New", monospace';

export const TERMINAL_FONT_SIZE = 12.5;
export const TERMINAL_SCROLLBACK = 5000;
