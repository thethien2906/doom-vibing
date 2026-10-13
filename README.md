# VibeTerm — Hierarchical Multi-Window Terminal Manager

A high-performance, minimalist desktop terminal manager designed for granular multi-process orchestration. Unlike traditional terminals that offer simple tabs or flat splits, **VibeTerm** organizes workspaces hierarchically: **multiple positioned terminal windows (panes), where each window contains its own independent tab set**.

Inspired by the design philosophy and architecture of [`erwining`](../erwining).

---

## ⚡ Core Concept: Hierarchical Structure

```
Workspace / Preset (e.g., "Fullstack Dev Stack")
 ├── Window Pane #1 (Top-Left)     ── [api server] [worker]
 ├── Window Pane #2 (Top-Right)    ── [vite dev]   [css watch]
 ├── Window Pane #3 (Bottom-Left)  ── [compose logs] [redis monitor]
 └── Window Pane #4 (Bottom-Right) ── [git shell]  [system]
```

- **Top-Level Layout**: A managed CSS-grid canvas (2×2 quad, 3-column stack, 1-top + 2-bottom, …).
- **Per-Window Tabs**: Each window is an independent container holding multiple PTY-backed tabs.
- **Independent State**: Switching a tab in Window #1 has zero impact on Windows #2, #3, or #4 — background
  tabs keep streaming output into their own scrollback because each keeps a live `xterm.js` instance and PTY.

---

## 🛠 Tech Stack

| Layer | Technology | Role |
| :--- | :--- | :--- |
| **Desktop Shell** | [Tauri v2](https://v2.tauri.app/) (Rust) | Lightweight, cross-platform native wrapper and IPC bridge |
| **PTY Backend** | [`portable-pty`](https://crates.io/crates/portable-pty) | Native pseudo-terminal spawning, streaming, and resizing |
| **Frontend** | React 18 + TypeScript + Vite | UI state management, layout rendering, tab lifecycle |
| **Terminal Viewport** | `@xterm/xterm` + `@xterm/addon-fit` + `@xterm/addon-webgl` | GPU/canvas-accelerated terminal emulator (WebGL with automatic canvas fallback) |
| **Styling** | Tailwind CSS | Minimalist dark theme (the `erwining` standard) |
| **Icons** | `lucide-react` | Clean 1.75px outline iconography |

---

## 🚀 Getting Started

### Desktop app (real PTY shells)

```bash
npm install
npm run tauri dev      # launches the Tauri desktop window
```

> Requires the Rust toolchain and Tauri v2 system dependencies
> (`webkit2gtk-4.1`, `libappindicator`, … on Linux — see the Tauri prerequisites guide).

### Browser preview (no Rust needed)

```bash
npm run dev            # http://localhost:1420
```

When no Tauri runtime is detected, the app falls back to a **mock shell** so the entire UI
(split layouts, tabs, presets, broadcast, maximize) can be exercised in a plain browser. The
mock supports echoing, `Backspace`, `Ctrl+C`, `Ctrl+L`, and a few demo commands (`help`, `ls`,
`cd`, `echo`, …).

### Production build

```bash
npm run build                      # type-check + bundle the frontend
npm run tauri build                # compile the desktop binary + installers
```

---

## ⌨️ Keyboard Shortcuts

| Shortcut | Action |
| :--- | :--- |
| `Ctrl/Cmd + Shift + T` | New tab in the focused window |
| `Ctrl/Cmd + Shift + W` | Close the active tab |
| `Ctrl/Cmd + Shift + N` | Add a new window |
| `Ctrl/Cmd + Shift + B` | Toggle broadcast mode |

**Broadcast mode** forwards keystrokes typed in any terminal to every other live session —
handy for running the same command across all shells at once.

---

## 🧩 Features

- **Hierarchical windows × tabs** — 4 windows × 2 tabs by default (8 concurrent shells).
- **Layout presets** — `2×2` quad, `1×3` column stack, `1+2` console split; save/apply custom
  presets (persisted in local storage, shown alongside the built-ins).
- **Per-window operations** — add/close/rename tabs (double-click a tab to rename), maximize a
  pane to fill the canvas, close a window.
- **Live status** — per-tab running/exited indicator, session count, UTF-8 badge, PTY-ready state.
- **Zero-distraction dark UI** — follows the `erwining` design standard.

---

## 📂 Repository Structure

```
doom-vibing/
├── docs/
│   ├── specification.md        # Architectural & development specification
│   └── preview.html            # Interactive HTML prototype of the layout
├── preview.html                # Root copy of the prototype
├── src/                        # React frontend
│   ├── components/             # Sidebar, TopToolbar, WindowGrid, TerminalPane, TabBar, TerminalView
│   ├── hooks/                  # useTerminalManager, usePtySession, usePresets
│   ├── lib/                    # cn, id, theme, workspace factories & default presets
│   ├── services/               # ptyApi (IPC + browser mock), presetStore
│   ├── types/                  # Workspace / WindowPane / TerminalTab models
│   ├── App.tsx                 # Composition root + global shortcuts
│   ├── main.tsx
│   └── index.css               # Tailwind layers, layout presets, xterm overrides
├── src-tauri/                  # Rust backend (Tauri v2 + PTY engine)
│   ├── src/
│   │   ├── main.rs             # Binary entry point
│   │   ├── lib.rs              # Builder, state registration, shutdown cleanup
│   │   ├── pty_manager.rs      # Thread-safe PTY registry + stream forwarders (+ unit tests)
│   │   └── commands.rs         # pty_spawn / pty_write / pty_resize / pty_kill
│   ├── capabilities/           # Tauri v2 permissions
│   ├── icons/
│   ├── Cargo.toml
│   └── tauri.conf.json
├── index.html
├── package.json
├── vite.config.ts
├── tailwind.config.js
└── README.md
```

---

## 🔌 Backend IPC Contract

| Command | Arguments | Returns | Description |
| :--- | :--- | :--- | :--- |
| `pty_spawn` | `sessionId, cwd?, command?, cols, rows` | `string` | Spawns `$SHELL` (or `cmd.exe`) in a new PTY and starts the reader thread. |
| `pty_write` | `sessionId, data` | `()` | Writes keystrokes/data into the PTY. |
| `pty_resize` | `sessionId, cols, rows` | `()` | Notifies the PTY of a new terminal size (SIGWINCH). |
| `pty_kill` | `sessionId` | `()` | Terminates the child process and releases the session. |

**Events (Rust → Webview)**

- `pty_output_{sessionId}` → `string` — a chunk of terminal output.
- `pty_exit_{sessionId}` → `number` — the child's exit code.

The frontend generates each `sessionId` and subscribes to the two events *before* calling
`pty_spawn`, which guarantees no early bytes (e.g. the shell prompt) are dropped.

---

## 🎨 Design Philosophy (erwining Standard)

- **Pure Minimalist Dark Theme**: base `#121212`, sidebar/headers `#181818`, active `#2A2A2A`,
  1px borders `#282828` / `#333333`, minimal cyan/green/yellow accents.
- **Zero Distraction**: no gratuitous animation, shadows, or gradients; monospace terminal text
  (`JetBrains Mono` / `Fira Code`).
- **Local-First & Fast**: no cloud dependency; native PTYs and a tiny memory footprint versus Electron.

---

## ✅ Verification

```bash
npm run build                        # tsc + vite build
cd src-tauri && cargo test --lib     # PTY manager unit tests (spawns a real shell)
```
