# Technical Specification: Hierarchical Multi-Window Terminal Manager

**Project Code**: `VibeTerm`  
**Reference App**: [`erwining`](file:///home/jacktheripper/code/personal/erwining)  
**Target Platform**: Linux / macOS / Windows Desktop  
**Primary Stack**: Tauri v2 + Rust (`portable-pty`) + React 18 + TypeScript + Tailwind CSS + `@xterm/xterm`

---

## 1. System Overview & Problem Statement

### 1.1 The Problem
Traditional terminal emulators (Alacritty, WezTerm, Kitty, standard Terminal) either:
- Provide flat tabs at the window level with ad-hoc internal splits, or
- Require complex nested multiplexer configurations (e.g. Tmux inside Tmux) that are difficult to visualize and manage.

### 1.2 The Solution
**VibeTerm** provides **hierarchical window management**:
1. A **Workspace Canvas** structured into multiple positioned terminal windows/panes (e.g. 2×2 quad grid, 3-column split, or custom resizable splits).
2. Inside **each window**, an independent **tab manager** holding multiple terminal sessions (e.g., 4 windows with 2 tabs each = 8 isolated shell sessions).
3. Switching a tab in Window 1 only alters Window 1's active viewport; Windows 2, 3, and 4 maintain continuous output and rendering.
4. Layout presets can be saved, named, and restored instantly.

---

## 2. System Architecture

```
┌────────────────────────────────────────────────────────────────────────┐
│                          REACT FRONTEND UI                             │
│                                                                        │
│  ┌───────────────┐  ┌────────────────────────────────────────────────┐ │
│  │    Sidebar    │  │               Terminal Canvas                  │ │
│  │ (Presets &    │  │ ┌──────────────────────┐ ┌───────────────────┐ │ │
│  │  Workspaces)  │  │ │  Window Pane #1      │ │ Window Pane #2    │ │ │
│  │               │  │ │  [Tab 1] [Tab 2] [+] │ │ [Tab 1] [Tab 2]  │ │ │
│  │               │  │ │  ┌─────────────────┐ │ │ ┌───────────────┐ │ │ │
│  │               │  │ │  │ xterm.js View   │ │ │ │ xterm.js View │ │ │ │
│  │               │  │ │  └─────────────────┘ │ │ └───────────────┘ │ │ │
│  │               │  │ └──────────────────────┘ └───────────────────┘ │ │
│  │               │  │ ┌──────────────────────┐ ┌───────────────────┐ │ │
│  │               │  │ │  Window Pane #3      │ │ Window Pane #4    │ │ │
│  │               │  │ │  [Tab 1] [Tab 2] [+] │ │ [Tab 1] [Tab 2]  │ │ │
│  │               │  │ └──────────────────────┘ └───────────────────┘ │ │
│  └───────────────┘  └────────────────────────────────────────────────┘ │
└────────────────────────────────────┬───────────────────────────────────┘
                                     │ Tauri IPC (Commands & Events)
┌────────────────────────────────────▼───────────────────────────────────┐
│                          TAURI v2 RUST CORE                            │
│                                                                        │
│  ┌──────────────────────┐  ┌─────────────────────────────────────────┐ │
│  │   IPC Command API    │  │         PTY Manager (Arc<Mutex<..>>)     │ │
│  │ - pty_spawn          │  │ ┌──────────────────────────────────────┐ │ │
│  │ - pty_write          │  │ │ Session 1: MasterPty + Child Process │ │ │
│  │ - pty_resize         │  │ ├──────────────────────────────────────┤ │ │
│  │ - pty_kill           │  │ │ Session 2: MasterPty + Child Process │ │ │
│  │ - preset_save / load │  │ ├──────────────────────────────────────┤ │ │
│  └──────────────────────┘  │ │ Session N: ...                       │ │ │
│                            │ └──────────────────────────────────────┘ │ │
│                            │ Thread-pool background reader threads   │ │
│                            │ -> emits `pty_output_{sessionId}` events │ │
└────────────────────────────┴─────────────────────────────────────────┴─┘
```

---

## 3. Data Models & TypeScript Contracts

### 3.1 Domain Types (`src/types/index.ts`)

```typescript
export type SplitOrientation = 'horizontal' | 'vertical';

export interface TerminalTab {
  id: string;              // Unique Tab UUID
  title: string;           // E.g. "node server.js" or "zsh"
  sessionId: string;       // PTY Session ID in Rust backend
  cwd?: string;            // Initial working directory
  command?: string;        // Optional auto-executed command on spawn
  status: 'active' | 'exited' | 'idle';
  exitCode?: number;
}

export interface WindowPane {
  id: string;              // Window ID (e.g. "win-1", "win-2")
  title: string;           // Optional label (e.g., "Backend API")
  tabs: TerminalTab[];     // All tabs assigned to this window
  activeTabId: string;     // Currently visible tab
  flexBasis?: number;      // Grid/flex ratio for custom resizing
}

export type LayoutMode = 'grid-2x2' | 'col-3' | 'col-2' | '1top-2bot' | 'custom';

export interface WorkspacePreset {
  id: string;
  name: string;            // E.g. "Fullstack Dev Stack"
  layout: LayoutMode;
  windows: WindowPane[];   // Configuration snapshot
  createdAt: string;
  updatedAt: string;
}
```

---

## 4. Rust Backend & PTY Engine (`src-tauri`)

### 4.1 Required Dependencies (`src-tauri/Cargo.toml`)

```toml
[dependencies]
tauri = { version = "2", features = [] }
serde = { version = "1", features = ["derive"] }
serde_json = "1"
portable-pty = "0.8"
tokio = { version = "1", features = ["full"] }
uuid = { version = "1", features = ["v4"] }
rusqlite = { version = "0.32", features = ["bundled"] }
```

### 4.2 PTY Manager Implementation Spec

The Rust layer maintains a thread-safe registry of active pseudo-terminals:

```rust
use portable_pty::{native_pty_system, Child, CommandBuilder, MasterPty, PtySize};
use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use std::io::{Read, Write};

pub struct PtySession {
    pub master: Box<dyn MasterPty + Send>,
    pub writer: Box<dyn Write + Send>,
    pub child: Box<dyn Child + Send + Sync>,
}

#[derive(Default)]
pub struct PtyManager {
    pub sessions: Arc<Mutex<HashMap<String, PtySession>>>,
}
```

### 4.3 IPC Command Definitions

| Command | Arguments | Return | Description |
| :--- | :--- | :--- | :--- |
| `pty_spawn` | `{ cwd?: string, command?: string, cols: u16, rows: u16 }` | `Result<String, String>` | Spawns a shell (`$SHELL` or `/bin/bash` or `cmd.exe`), returns `sessionId`. Starts a background thread reading output. |
| `pty_write` | `{ sessionId: string, data: string }` | `Result<(), String>` | Writes user keystrokes/data to the slave PTY writer. |
| `pty_resize` | `{ sessionId: string, cols: u16, rows: u16 }` | `Result<(), String>` | Notifies PTY master of terminal dimension changes (SIGWINCH). |
| `pty_kill` | `{ sessionId: string }` | `Result<(), String>` | Terminates child process and releases OS file descriptors. |

### 4.4 Event Streaming (Rust -> Webview)

- **Channel**: `pty_output_{sessionId}`
  - Emitted whenever the background reader thread receives bytes from the PTY master.
  - Data payload: `String` (UTF-8 encoded terminal byte stream).
- **Channel**: `pty_exit_{sessionId}`
  - Emitted when the child process exits, passing the integer status code.

---

## 5. Frontend Terminal Engine (`@xterm/xterm`)

### 5.1 Terminal Instance Lifecycle
Each tab maintains an isolated `Terminal` instance:
1. **Creation**:
   - Spawns `new Terminal({ theme: getDarkTheme(), fontFamily: 'JetBrains Mono', fontSize: 13, cursorBlink: true })`.
   - Attaches `FitAddon` and `WebglAddon` (fallback to Canvas if WebGL is unavailable).
2. **Mounting**:
   - When Tab is active: Attached to DOM element `<div ref={containerRef} />`.
   - `fitAddon.fit()` is called immediately, and dimensions (`cols`, `rows`) are sent via `pty_resize`.
3. **Tab Switching**:
   - When switching tabs within the same window, the previous tab's DOM element is hidden (`display: none`), while the selected tab's DOM element is made visible (`display: block`).
   - `fitAddon.fit()` is triggered on the newly visible tab to ensure exact dimensions.
   - **Crucial**: The `Terminal` instance and backend PTY remain alive in the background so output continues streaming without loss.

### 5.2 Resize Observer
Each `TerminalPane` contains a native `ResizeObserver`:
```typescript
const observer = new ResizeObserver(() => {
  if (fitAddon && activeTab) {
    fitAddon.fit();
    tauriApi.resizePty(activeTab.sessionId, term.cols, term.rows);
  }
});
```

---

## 6. Layout & Window Management

### 6.1 Default Layout (4 Windows × 2 Tabs)

- Default Viewport:
  - **Grid**: `grid-template-columns: 1fr 1fr; grid-template-rows: 1fr 1fr;`
  - **Window 1 (Top-Left)**: Tab 1 + Tab 2
  - **Window 2 (Top-Right)**: Tab 1 + Tab 2
  - **Window 3 (Bottom-Left)**: Tab 1 + Tab 2
  - **Window 4 (Bottom-Right)**: Tab 1 + Tab 2

### 6.2 Supported Layout Configurations

1. **`grid-2x2`** (Quad Grid): 4 equal quadrants.
2. **`col-3`** (Triple Column): 3 side-by-side vertical panes.
3. **`1top-2bot`** (Console Split): 1 full-width master pane on top, 2 split panes on bottom.
4. **`maximized`**: Any window can toggle into full-canvas view (`grid-column: 1 / -1; grid-row: 1 / -1; z-index: 20`), hiding other windows temporarily without killing their processes.

### 6.3 Window Operations
- **Add Tab (`+`)**: Spawns a new PTY session and adds it to the window's tab bar.
- **Close Tab (`×`)**: Kills the backend PTY session, removes tab from state, and focuses the previous tab.
- **Maximize (`⛶`)**: Expands pane to fill the entire canvas.
- **Close Window (`✕`)**: Closes all child tabs and reorganizes the remaining window grid.

---

## 7. UI/UX Style Specification (Adhering to erwining)

### 7.1 Color System

| UI Component | HEX Color | Purpose |
| :--- | :--- | :--- |
| `bg-dark-base` | `#121212` | Main canvas background & terminal background |
| `bg-dark-sidebar` | `#181818` | Left sidebar background & window pane chrome |
| `bg-dark-hover` | `#222222` | Item hover background |
| `bg-dark-active` | `#2A2A2A` | Active tab / selected preset background |
| `border-dark` | `#282828` / `#333333` | 1px border lines dividing panes and tabs |
| `text-primary` | `#EDEDED` | Main text, tab labels, active content |
| `text-secondary` | `#A3A3A3` | Inactive tabs, secondary labels |
| `text-muted` | `#737373` | Dim labels, closed icons, metadata |
| `accent-cyan` | `#38bdf8` | Active tab bottom indicator line, path highlights |
| `accent-green` | `#4ade80` | Process running indicator, success statuses |

### 7.2 Typography
- **Application Chrome**: `Inter`, `-apple-system`, `BlinkMacSystemFont`, `"Segoe UI"`, `sans-serif`.
- **Terminal Buffer**: `"JetBrains Mono"`, `"Fira Code"`, `"Consolas"`, `monospace`.

---

## 8. Development Roadmap

### Phase 1: Tauri v2 Project Setup & PTY Layer
- Initialize Tauri v2 project structure in workspace.
- Implement `src-tauri/src/pty_manager.rs` with `portable-pty`.
- Expose `pty_spawn`, `pty_write`, `pty_resize`, and `pty_kill` commands.
- Verify shell spawning on Linux (`/bin/bash` or `$SHELL`).

### Phase 2: Frontend State & xterm.js Integration
- Setup React 18 + TypeScript + Tailwind CSS.
- Build `usePtySession` hook connecting `@xterm/xterm` with Tauri event listener.
- Implement hidden-tab caching so background tabs preserve scrollback and terminal state.

### Phase 3: Window & Tab Components
- Build `TabBar` component with add, close, switch, and running-status indicator.
- Build `TerminalPane` component with header, viewport, status bar, and maximize toggle.
- Build `WindowGrid` handling 2×2, 3-column, and 1+2 layouts.

### Phase 4: Presets & Persistence
- Build Left Sidebar matching `erwining` layout.
- Save workspace presets (number of windows, tab labels, working directories) to local storage or SQLite.
- Add keyboard shortcuts (`Ctrl+Shift+T` for new tab in active pane, `Ctrl+Shift+W` to close tab).

---

## 9. Verification & Reference Files

- **Interactive Layout Prototype**: [docs/preview.html](file:///home/jacktheripper/code/personal/doom-vibing/docs/preview.html)
- **Top-Level Readme**: [README.md](file:///home/jacktheripper/code/personal/doom-vibing/README.md)
- **Design Standard**: [erwining design-style.md](file:///home/jacktheripper/code/personal/erwining/design-style.md)

---

## 10. Implementation Notes (Deviations & Additions)

The shipped implementation follows this specification with a few deliberate choices:

1. **Frontend-generated `sessionId`.** The spec had `pty_spawn` generate and return the id.
   Instead the frontend generates the id and passes it in, so it can subscribe to
   `pty_output_{sessionId}` / `pty_exit_{sessionId}` **before** invoking `pty_spawn`. This
   removes a race where the shell's first prompt could be emitted before the listener attached.
   `pty_spawn` still returns the session id (`Result<String, String>`) as specified.

2. **`PtyManager` uses an injectable emitter.** Output is forwarded through an `EventEmitter`
   closure rather than being hard-wired to `AppHandle::emit`. The production path wraps
   `AppHandle::emit`; unit tests inject an `mpsc` sender, which lets `cargo test` spawn a real
   shell and assert that output streams back.

3. **Presets are stored in webview `localStorage`, not SQLite.** The spec allowed either. Built-in
   presets are static; user presets are persisted separately and merged at runtime. No SQLite
   dependency is required.

4. **Broadcast mode is implemented.** Keystrokes typed into any terminal are mirrored to every
   other live session while enabled (`Ctrl/Cmd + Shift + B`).

5. **Browser fallback.** When the Tauri runtime is absent (plain `npm run dev`), `services/ptyApi.ts`
   provides an in-memory mock shell so the UI is fully explorable without the Rust backend.

6. **Layouts use CSS grid presets** (`grid-2x2`, `col-3`, `col-2`, `1top-2bot`) with an overlay class
   for maximizing. Drag-to-resize (`flexBasis`) is modelled in the types but not yet wired to a
   resize handle.

