import { invoke } from '@tauri-apps/api/core';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import type { PtySpawnOptions } from '../types';

export const isTauriRuntime =
  typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

export type Unsubscribe = () => void;

/* ------------------------------------------------------------------ *
 * Browser mock shell
 *
 * A small interactive shell simulation so the full UI can be exercised
 * with `npm run dev` and no Tauri/PTY backend. Output flows through a
 * per-session hub that buffers bytes until a listener attaches, mirroring
 * the ordering guarantee of the real Tauri event channel.
 * ------------------------------------------------------------------ */

type DataListener = (data: string) => void;
type ExitListener = (code: number) => void;

const ESC = '\x1b';

interface MockHub {
  dataListeners: Set<DataListener>;
  exitListeners: Set<ExitListener>;
  backlog: string[];
  exited: number | null;
  shell: MockShell | null;
}

const hubs = new Map<string, MockHub>();

function getHub(sessionId: string): MockHub {
  let hub = hubs.get(sessionId);
  if (!hub) {
    hub = {
      dataListeners: new Set(),
      exitListeners: new Set(),
      backlog: [],
      exited: null,
      shell: null,
    };
    hubs.set(sessionId, hub);
  }
  return hub;
}

function hubEmit(sessionId: string, data: string): void {
  const hub = getHub(sessionId);
  if (hub.dataListeners.size === 0) {
    hub.backlog.push(data);
    return;
  }
  hub.dataListeners.forEach((cb) => cb(data));
}

class MockShell {
  private line = '';
  private cwd = '~';
  private disposed = false;

  constructor(private id: string, private opts: PtySpawnOptions) {
    if (opts.cwd) this.cwd = opts.cwd;
    setTimeout(() => this.bootstrap(), 60);
  }

  private emit(data: string): void {
    if (this.disposed) return;
    hubEmit(this.id, data);
  }

  private prompt(): string {
    return `${ESC}[32mjack${ESC}[0m@${ESC}[36m${this.cwd}${ESC}[0m ${ESC}[35m➜${ESC}[0m `;
  }

  private bootstrap(): void {
    if (this.disposed) return;
    this.emit(`${ESC}[90mVibeTerm browser preview — mock shell session${ESC}[0m\r\n`);
    this.emit(
      `${ESC}[90mNo Tauri backend detected. Type ${ESC}[0mhelp${ESC}[90m for commands.${ESC}[0m\r\n\r\n`
    );
    this.emit(this.prompt());
    if (this.opts.command) this.handleInput(`${this.opts.command}\r`);
  }

  write(data: string): void {
    this.handleInput(data);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    const hub = getHub(this.id);
    hub.shell = null;
    hub.backlog = [];
    hub.exited = 0;
    hub.exitListeners.forEach((cb) => cb(0));
    hub.dataListeners.clear();
    hub.exitListeners.clear();
  }

  private handleInput(raw: string): void {
    for (let i = 0; i < raw.length; i++) {
      const ch = raw[i];
      const code = ch.charCodeAt(0);

      if (ch === ESC) {
        i = this.skipEscapeSequence(raw, i);
        continue;
      }

      if (ch === '\r' || ch === '\n') {
        if (ch === '\n' && raw[i - 1] === '\r') continue;
        this.emit('\r\n');
        this.runCommand(this.line);
        this.line = '';
        this.emit(this.prompt());
        continue;
      }

      if (ch === '\x7f' || ch === '\b') {
        if (this.line.length > 0) {
          this.line = this.line.slice(0, -1);
          this.emit('\b \b');
        }
        continue;
      }

      if (ch === '\x03') {
        this.emit('^C\r\n');
        this.line = '';
        this.emit(this.prompt());
        continue;
      }

      if (ch === '\x0c') {
        this.emit(`${ESC}[2J${ESC}[3J${ESC}[H`);
        this.emit(this.prompt() + this.line);
        continue;
      }

      if (ch === '\x15') {
        while (this.line.length > 0) {
          this.line = this.line.slice(0, -1);
          this.emit('\b \b');
        }
        continue;
      }

      if (ch === '\t') continue;

      if (code >= 32) {
        this.line += ch;
        this.emit(ch);
      }
    }
  }

  private skipEscapeSequence(raw: string, start: number): number {
    const next = raw[start + 1];
    if (next === '[') {
      let i = start + 2;
      while (i < raw.length) {
        const c = raw.charCodeAt(i);
        if (c >= 0x40 && c <= 0x7e) return i;
        i++;
      }
      return raw.length;
    }
    return Math.min(start + 1, raw.length - 1);
  }

  private runCommand(input: string): void {
    const cmd = input.trim();
    if (!cmd) return;

    if (cmd === 'clear') {
      this.emit(`${ESC}[2J${ESC}[3J${ESC}[H`);
      return;
    }
    if (cmd === 'help') {
      const lines = [
        'Available demo commands:',
        '  help          show this message',
        '  ls            list directory contents',
        '  pwd           print working directory',
        '  whoami        print current user',
        '  echo <text>   print text',
        '  cd <dir>      change directory',
        '  uname -a      system information',
        '  node -v       node version',
        '  date          current date/time',
        '  clear         clear the screen',
      ];
      this.emit(`${lines.map((l) => `${ESC}[90m${l}${ESC}[0m`).join('\r\n')}\r\n`);
      return;
    }
    if (cmd === 'ls' || cmd === 'll' || cmd === 'ls -la') {
      this.emit(
        `${ESC}[34mdocs${ESC}[0m  ${ESC}[34msrc${ESC}[0m  ${ESC}[34msrc-tauri${ESC}[0m  ${ESC}[32mREADME.md${ESC}[0m  index.html  package.json\r\n`
      );
      return;
    }
    if (cmd === 'pwd') {
      this.emit(`${this.cwd.replace('~', '/home/jack')}\r\n`);
      return;
    }
    if (cmd === 'whoami') {
      this.emit('jack\r\n');
      return;
    }
    if (cmd.startsWith('echo ')) {
      this.emit(`${cmd.slice(5)}\r\n`);
      return;
    }
    if (cmd === 'date') {
      this.emit(`${new Date().toString()}\r\n`);
      return;
    }
    if (cmd === 'node -v') {
      this.emit('v24.21.0\r\n');
      return;
    }
    if (cmd.startsWith('uname')) {
      this.emit('Linux Balthasar-Magi-2 7.0.0 x86_64 GNU/Linux\r\n');
      return;
    }
    if (cmd === 'cd' || cmd === 'cd ~') {
      this.cwd = '~';
      return;
    }
    if (cmd.startsWith('cd ')) {
      const target = cmd.slice(3).trim();
      if (target === '..') {
        if (this.cwd !== '~') {
          this.cwd = this.cwd.includes('/')
            ? this.cwd.slice(0, this.cwd.lastIndexOf('/')) || '~'
            : '~';
        }
        return;
      }
      if (target.startsWith('-')) return;
      this.cwd = target.startsWith('~')
        ? target
        : `${this.cwd === '~' ? '~' : this.cwd}/${target}`;
      return;
    }

    this.emit(`${ESC}[31mzsh: command not found: ${cmd.split(' ')[0]}${ESC}[0m\r\n`);
  }
}

/* ------------------------------------------------------------------ *
 * Public API
 * ------------------------------------------------------------------ */

export async function spawnPty(opts: PtySpawnOptions): Promise<void> {
  if (isTauriRuntime) {
    await invoke('pty_spawn', {
      sessionId: opts.sessionId,
      cwd: opts.cwd ?? null,
      command: opts.command ?? null,
      cols: opts.cols,
      rows: opts.rows,
    });
    return;
  }
  const hub = getHub(opts.sessionId);
  hub.shell = new MockShell(opts.sessionId, opts);
}

export async function writePty(sessionId: string, data: string): Promise<void> {
  if (isTauriRuntime) {
    await invoke('pty_write', { sessionId, data });
    return;
  }
  hubs.get(sessionId)?.shell?.write(data);
}

export async function resizePty(sessionId: string, cols: number, rows: number): Promise<void> {
  if (isTauriRuntime) {
    await invoke('pty_resize', { sessionId, cols, rows });
  }
}

export async function killPty(sessionId: string): Promise<void> {
  if (isTauriRuntime) {
    await invoke('pty_kill', { sessionId });
    return;
  }
  const hub = hubs.get(sessionId);
  if (hub) {
    hub.shell?.dispose();
    hubs.delete(sessionId);
  }
}

export async function onPtyOutput(
  sessionId: string,
  cb: (data: string) => void
): Promise<Unsubscribe> {
  if (isTauriRuntime) {
    const unlisten: UnlistenFn = await listen<string>(`pty_output_${sessionId}`, (event) =>
      cb(event.payload)
    );
    return unlisten;
  }

  const hub = getHub(sessionId);
  hub.dataListeners.add(cb);
  if (hub.backlog.length > 0) {
    const pending = hub.backlog;
    hub.backlog = [];
    pending.forEach((chunk) => cb(chunk));
  }
  return () => hub.dataListeners.delete(cb);
}

export async function onPtyExit(
  sessionId: string,
  cb: (code: number) => void
): Promise<Unsubscribe> {
  if (isTauriRuntime) {
    const unlisten: UnlistenFn = await listen<number>(`pty_exit_${sessionId}`, (event) =>
      cb(event.payload)
    );
    return unlisten;
  }

  const hub = getHub(sessionId);
  if (hub.exited !== null) {
    cb(hub.exited);
    return () => {};
  }
  hub.exitListeners.add(cb);
  return () => hub.exitListeners.delete(cb);
}
