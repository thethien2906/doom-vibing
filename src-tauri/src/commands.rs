use tauri::{AppHandle, State};

use crate::pty_manager::PtyManager;

/// Spawn a new shell-backed PTY session under the caller-provided id.
#[tauri::command]
pub fn pty_spawn(
    app: AppHandle,
    state: State<'_, PtyManager>,
    session_id: String,
    cwd: Option<String>,
    command: Option<String>,
    cols: u16,
    rows: u16,
) -> Result<String, String> {
    state.spawn(app, session_id, cwd, command, cols, rows)
}

/// Forward user keystrokes into the PTY.
#[tauri::command]
pub fn pty_write(
    state: State<'_, PtyManager>,
    session_id: String,
    data: String,
) -> Result<(), String> {
    state.write(&session_id, &data)
}

/// Notify the PTY of a new terminal size (SIGWINCH).
#[tauri::command]
pub fn pty_resize(
    state: State<'_, PtyManager>,
    session_id: String,
    cols: u16,
    rows: u16,
) -> Result<(), String> {
    state.resize(&session_id, cols, rows)
}

/// Terminate the child process and release the session.
#[tauri::command]
pub fn pty_kill(state: State<'_, PtyManager>, session_id: String) -> Result<(), String> {
    state.kill(&session_id)
}

/// Query the current working directory of a running PTY session.
#[tauri::command]
pub fn pty_get_cwd(state: State<'_, PtyManager>, session_id: String) -> Result<Option<String>, String> {
    Ok(state.get_cwd(&session_id))
}
