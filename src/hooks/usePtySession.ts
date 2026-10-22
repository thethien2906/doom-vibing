import { useCallback, useEffect, useRef } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebglAddon } from '@xterm/addon-webgl';
import { ClipboardAddon } from '@xterm/addon-clipboard';
import {
  getPtyCwd,
  killPty,
  onPtyExit,
  onPtyOutput,
  resizePty,
  spawnPty,
  writePty,
  type Unsubscribe,
} from '../services/ptyApi';
import {
  TERMINAL_FONT_FAMILY,
  TERMINAL_FONT_SIZE,
  TERMINAL_SCROLLBACK,
  TERMINAL_THEME,
} from '../lib/theme';

export interface UsePtySessionOptions {
  sessionId: string;
  cwd?: string;
  command?: string;
  active: boolean;
  onBroadcast?: (sourceSessionId: string, data: string) => void;
  onCwdChange?: (sessionId: string, cwd: string) => void;
  onSpawned?: () => void;
  onExit?: (code: number) => void;
}

export interface PtySessionHandle {
  containerRef: React.RefObject<HTMLDivElement>;
  focus: () => void;
  fit: () => void;
}

/**
 * Owns a single xterm.js instance bound to one backend PTY session.
 *
 * The terminal and its PTY stay alive for the lifetime of the tab, even while
 * hidden, so background output keeps streaming into scrollback.
 */
export function usePtySession(options: UsePtySessionOptions): PtySessionHandle {
  const containerRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<Terminal | null>(null);
  const fitRef = useRef<FitAddon | null>(null);
  const webglRef = useRef<WebglAddon | null>(null);

  const optionsRef = useRef(options);
  optionsRef.current = options;

  const { sessionId } = options;

  const lastSizeRef = useRef<{ cols: number; rows: number }>({ cols: 0, rows: 0 });

  // Lazily attach the WebGL renderer once the pane is actually visible.
  const ensureWebgl = useCallback(() => {
    if (webglRef.current) return;
    const term = termRef.current;
    const container = containerRef.current;
    if (!term || !container) return;
    if (container.clientWidth === 0 || container.clientHeight === 0) return;
    try {
      const webgl = new WebglAddon();
      webgl.onContextLoss(() => {
        webgl.dispose();
        webglRef.current = null;
      });
      term.loadAddon(webgl);
      webglRef.current = webgl;
    } catch {
      webglRef.current = null; // fall back to the default canvas renderer
    }
  }, []);

  const fit = useCallback(
    (shouldFocus = false) => {
      const term = termRef.current;
      const fitAddon = fitRef.current;
      const container = containerRef.current;
      if (!term || !fitAddon || !container) return;
      if (container.clientWidth === 0 || container.clientHeight === 0) return;
      ensureWebgl();
      try {
        fitAddon.fit();
      } catch {
        return;
      }
      if (
        term.cols > 0 &&
        term.rows > 0 &&
        (term.cols !== lastSizeRef.current.cols || term.rows !== lastSizeRef.current.rows)
      ) {
        lastSizeRef.current = { cols: term.cols, rows: term.rows };
        void resizePty(sessionId, term.cols, term.rows);
      }
      if (shouldFocus) term.focus();
    },
    [ensureWebgl, sessionId]
  );

  // Create the terminal and its PTY once per session id.
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const term = new Terminal({
      fontFamily: TERMINAL_FONT_FAMILY,
      fontSize: TERMINAL_FONT_SIZE,
      lineHeight: 1.2,
      letterSpacing: 0,
      cursorBlink: true,
      cursorStyle: 'bar',
      scrollback: TERMINAL_SCROLLBACK,
      theme: TERMINAL_THEME,
      allowProposedApi: true,
      convertEol: false,
    });
    const fitAddon = new FitAddon();
    const clipboardAddon = new ClipboardAddon();
    term.loadAddon(fitAddon);
    term.loadAddon(clipboardAddon);

    // Register OSC 7 (cwd file:// URI) and OSC 9;9 (ConEmu/Windows Terminal cwd)
    term.parser.registerOscHandler(7, (data) => {
      let path = data;
      if (path.startsWith('file://')) {
        try {
          const url = new URL(path);
          path = decodeURIComponent(url.pathname);
          if (/^\/[a-zA-Z]:/.test(path)) {
            path = path.slice(1);
          }
        } catch {
          path = path.replace(/^file:\/\/[^\/]*/, '');
        }
      }
      if (path) {
        optionsRef.current.onCwdChange?.(sessionId, path);
        return true;
      }
      return false;
    });

    term.parser.registerOscHandler(9, (data) => {
      if (data.startsWith('9;')) {
        let path = data.slice(2).trim();
        if (path.startsWith('"') && path.endsWith('"')) {
          path = path.slice(1, -1);
        }
        if (path) {
          optionsRef.current.onCwdChange?.(sessionId, path);
          return true;
        }
      }
      return false;
    });

    term.open(container);

    termRef.current = term;
    fitRef.current = fitAddon;

    let cwdDebounceTimer: ReturnType<typeof setTimeout> | null = null;
    const triggerCwdCheck = (delayMs = 300) => {
      if (cwdDebounceTimer) clearTimeout(cwdDebounceTimer);
      cwdDebounceTimer = setTimeout(async () => {
        if (cancelled) return;
        const cwd = await getPtyCwd(sessionId);
        if (cwd && !cancelled) {
          optionsRef.current.onCwdChange?.(sessionId, cwd);
        }
      }, delayMs);
    };

/**
 * Normalizes input for terminal PTY:
 * Replaces non-breaking spaces (\u00A0, \u202F) and Unicode spaces with standard ASCII space (0x20),
 * and strips invisible zero-width formatting characters.
 * Prevents shells (bash, zsh) from choking on "cd code" with "command not found"
 * when typing with IBus/Unikey or WebKitGTK.
 */
function sanitizePtyInput(data: string): string {
  return data
    .replace(/[\u00A0\u1680\u2000-\u200A\u202F\u205F\u3000]/g, ' ')
    .replace(/[\u200B-\u200D\uFEFF]/g, '');
}

    // Support standard Ctrl+C / Ctrl+Shift+C and keyboard sanitization
    term.attachCustomKeyEventHandler((e: KeyboardEvent) => {
      // Query CWD after Enter is pressed (gives shell ~300ms to chdir)
      if (e.key === 'Enter' && e.type === 'keydown') {
        triggerCwdCheck(350);
      }

      // Normalize Shift+Space to regular space (WebKitGTK produces \u00a0 on Shift+Space)
      if (e.code === 'Space' && e.shiftKey && !e.ctrlKey && !e.altKey && !e.metaKey) {
        if (e.type === 'keydown') {
          term.input(' ');
        }
        return false;
      }

      const mod = e.ctrlKey || e.metaKey;
      if (e.type !== 'keydown' || !mod) return true;

      const key = e.key.toLowerCase();

      // Copy: Ctrl+Shift+C or Ctrl+C when there is active text selection
      if (key === 'c' && (e.shiftKey || term.hasSelection())) {
        const selection = term.getSelection();
        if (selection) {
          void navigator.clipboard.writeText(sanitizePtyInput(selection));
          term.clearSelection();
          return false;
        }
      }

      // Note: Paste (Ctrl+V / Ctrl+Shift+V) is natively handled by xterm's DOM paste listener
      // on helper textarea, which prevents duplicate paste triggers across platforms.

      return true;
    });

    // Auto copy on selection mouseup
    const handleMouseUp = () => {
      if (term.hasSelection()) {
        const text = term.getSelection();
        if (text) {
          void navigator.clipboard.writeText(sanitizePtyInput(text));
        }
      }
    };
    container.addEventListener('mouseup', handleMouseUp);

    // Right-click paste (or copy if selection exists)
    const handleContextMenu = (e: MouseEvent) => {
      e.preventDefault();
      if (term.hasSelection()) {
        const text = term.getSelection();
        if (text) {
          void navigator.clipboard.writeText(sanitizePtyInput(text));
          term.clearSelection();
        }
      } else {
        void navigator.clipboard.readText().then((text) => {
          if (text) {
            term.paste(sanitizePtyInput(text));
          }
        });
      }
    };
    container.addEventListener('contextmenu', handleContextMenu);

    let cancelled = false;
    const unsubs: Unsubscribe[] = [];

    const boot = async () => {
      // Fit before spawning so initial columns match the real container dimensions
      try {
        fitAddon.fit();
      } catch {
        /* container not measurable yet */
      }
      const initialCols = term.cols > 0 ? term.cols : 80;
      const initialRows = term.rows > 0 ? term.rows : 24;
      lastSizeRef.current = { cols: initialCols, rows: initialRows };

      // Subscribe before spawning so the first bytes are never dropped.
      unsubs.push(await onPtyOutput(sessionId, (data) => term.write(data)));
      unsubs.push(
        await onPtyExit(sessionId, (code) => {
          optionsRef.current.onExit?.(code);
          term.write(`\r\n\x1b[90m[process exited with code ${code}]\x1b[0m\r\n`);
        })
      );

      if (cancelled) return;
      try {
        await spawnPty({
          sessionId,
          cwd: optionsRef.current.cwd,
          command: optionsRef.current.command,
          cols: initialCols,
          rows: initialRows,
        });
      } catch (err) {
        term.write(`\r\n\x1b[31mFailed to spawn PTY: ${String(err)}\x1b[0m\r\n`);
        return;
      }
      if (cancelled) return;
      optionsRef.current.onSpawned?.();
      triggerCwdCheck(100);
      if (optionsRef.current.active) term.focus();
    };
    void boot();

    const dataSub = term.onData((raw) => {
      const data = sanitizePtyInput(raw);
      void writePty(sessionId, data);
      optionsRef.current.onBroadcast?.(sessionId, data);
    });

    return () => {
      cancelled = true;
      if (cwdDebounceTimer) clearTimeout(cwdDebounceTimer);
      container.removeEventListener('mouseup', handleMouseUp);
      container.removeEventListener('contextmenu', handleContextMenu);
      dataSub.dispose();
      unsubs.forEach((u) => u());
      void killPty(sessionId);
      webglRef.current?.dispose();
      webglRef.current = null;
      term.dispose();
      termRef.current = null;
      fitRef.current = null;
    };
  }, [sessionId]);

  // Fit + focus + clean refresh whenever this tab becomes visible
  useEffect(() => {
    if (!options.active) return;
    const term = termRef.current;
    if (!term) return;
    const raf = requestAnimationFrame(() => {
      fit(true);
      term.refresh(0, Math.max(0, term.rows - 1));
      term.scrollToBottom();
    });
    return () => cancelAnimationFrame(raf);
  }, [options.active, fit]);

  // Re-fit on container resize (layout changes, window resize).
  useEffect(() => {
    const container = containerRef.current;
    if (!container || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(() => {
      if (!optionsRef.current.active) return;
      fit(false);
    });
    observer.observe(container);
    return () => observer.disconnect();
  }, [fit]);

  const focus = useCallback(() => {
    fit(true);
  }, [fit]);

  return { containerRef, focus, fit: () => fit(false) };
}
