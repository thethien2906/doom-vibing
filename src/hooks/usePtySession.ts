import { useCallback, useEffect, useRef } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebglAddon } from '@xterm/addon-webgl';
import { ClipboardAddon } from '@xterm/addon-clipboard';
import {
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
      void resizePty(sessionId, term.cols, term.rows);
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
    term.open(container);

    termRef.current = term;
    fitRef.current = fitAddon;

    // Support standard Ctrl+C / Ctrl+Shift+C / Ctrl+V / Ctrl+Shift+V keyboard actions
    term.attachCustomKeyEventHandler((e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey;
      if (e.type !== 'keydown' || !mod) return true;

      const key = e.key.toLowerCase();

      // Copy: Ctrl+Shift+C or Ctrl+C when there is active text selection
      if (key === 'c' && (e.shiftKey || term.hasSelection())) {
        const selection = term.getSelection();
        if (selection) {
          void navigator.clipboard.writeText(selection);
          return false;
        }
      }

      // Paste: Ctrl+Shift+V or Ctrl+V
      if (key === 'v') {
        void navigator.clipboard.readText().then((text) => {
          if (text) {
            void writePty(sessionId, text);
            optionsRef.current.onBroadcast?.(sessionId, text);
          }
        });
        return false;
      }

      return true;
    });

    // Auto copy on selection mouseup
    const handleMouseUp = () => {
      if (term.hasSelection()) {
        const text = term.getSelection();
        if (text) {
          void navigator.clipboard.writeText(text);
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
          void navigator.clipboard.writeText(text);
        }
      } else {
        void navigator.clipboard.readText().then((text) => {
          if (text) {
            void writePty(sessionId, text);
            optionsRef.current.onBroadcast?.(sessionId, text);
          }
        });
      }
    };
    container.addEventListener('contextmenu', handleContextMenu);

    let cancelled = false;
    const unsubs: Unsubscribe[] = [];

    const boot = async () => {
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
          cols: term.cols || 80,
          rows: term.rows || 24,
        });
      } catch (err) {
        term.write(`\r\n\x1b[31mFailed to spawn PTY: ${String(err)}\x1b[0m\r\n`);
        return;
      }
      if (cancelled) return;
      optionsRef.current.onSpawned?.();
      try {
        fitAddon.fit();
      } catch {
        /* container not measurable yet */
      }
      void resizePty(sessionId, term.cols, term.rows);
      if (optionsRef.current.active) term.focus();
    };
    void boot();

    const dataSub = term.onData((data) => {
      void writePty(sessionId, data);
      optionsRef.current.onBroadcast?.(sessionId, data);
    });

    return () => {
      cancelled = true;
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

  // Fit + focus whenever this tab becomes the visible one.
  useEffect(() => {
    if (!options.active) return;
    const raf = requestAnimationFrame(() => fit(true));
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
