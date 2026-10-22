use portable_pty::{native_pty_system, Child, CommandBuilder, MasterPty, PtySize};
use std::collections::HashMap;
use std::io::{Read, Write};
use std::sync::{Arc, Mutex};
use tauri::{AppHandle, Emitter};

/// A single live pseudo-terminal: the master handle (for resizing), a writer
/// pipe for injecting keystrokes, and the spawned child process.
pub struct PtySession {
    master: Box<dyn MasterPty + Send>,
    writer: Box<dyn Write + Send>,
    child: Box<dyn Child + Send + Sync>,
}

/// Signature for forwarding `(event_name, payload)` back to the frontend. It is
/// abstracted over `AppHandle` so the manager can be exercised in unit tests.
pub type EventEmitter = Box<dyn Fn(String, String) + Send>;

/// Thread-safe registry of every active PTY keyed by its session id.
pub struct PtyManager {
    sessions: Arc<Mutex<HashMap<String, PtySession>>>,
}

impl Default for PtyManager {
    fn default() -> Self {
        Self::new()
    }
}

/// Resolve the interactive shell for the current platform.
fn default_shell() -> String {
    #[cfg(windows)]
    {
        std::env::var("COMSPEC").unwrap_or_else(|_| "cmd.exe".to_string())
    }
    #[cfg(not(windows))]
    {
        std::env::var("SHELL").unwrap_or_else(|_| "/bin/bash".to_string())
    }
}

impl PtyManager {
    pub fn new() -> Self {
        Self {
            sessions: Arc::new(Mutex::new(HashMap::new())),
        }
    }

    /// Spawn a shell backed by a new PTY, forwarding output via Tauri events.
    pub fn spawn(
        &self,
        app: AppHandle,
        session_id: String,
        cwd: Option<String>,
        command: Option<String>,
        cols: u16,
        rows: u16,
    ) -> Result<String, String> {
        let emitter: EventEmitter = Box::new(move |event: String, payload: String| {
            let _ = app.emit(&event, payload);
        });
        self.spawn_with(emitter, session_id, cwd, command, cols, rows)
    }

    /// Core spawn logic with an injectable emitter.
    pub fn spawn_with(
        &self,
        emit: EventEmitter,
        session_id: String,
        cwd: Option<String>,
        command: Option<String>,
        cols: u16,
        rows: u16,
    ) -> Result<String, String> {
        let pty_system = native_pty_system();
        let size = PtySize {
            rows,
            cols,
            pixel_width: 0,
            pixel_height: 0,
        };
        let pair = pty_system.openpty(size).map_err(|e| e.to_string())?;

        let mut cmd = CommandBuilder::new(default_shell());
        cmd.env("TERM", "xterm-256color");
        cmd.env("COLORTERM", "truecolor");
        if let Some(dir) = cwd.as_deref() {
            if !dir.is_empty() {
                cmd.cwd(dir);
            }
        }

        let child = pair.slave.spawn_command(cmd).map_err(|e| e.to_string())?;
        drop(pair.slave);

        let reader = pair.master.try_clone_reader().map_err(|e| e.to_string())?;
        let writer = pair.master.take_writer().map_err(|e| e.to_string())?;
        let master = pair.master;

        {
            let mut sessions = self.sessions.lock().unwrap();
            sessions.insert(
                session_id.clone(),
                PtySession {
                    master,
                    writer,
                    child,
                },
            );
        }

        // Optionally auto-run a command in the freshly spawned shell.
        if let Some(cmd_str) = command {
            if !cmd_str.is_empty() {
                let _ = self.write(&session_id, &format!("{}\n", cmd_str));
            }
        }

        self.start_reader(emit, session_id.clone(), reader);
        Ok(session_id)
    }

    /// Spawn the background thread that forwards PTY output to the webview.
    fn start_reader(&self, emit: EventEmitter, session_id: String, mut reader: Box<dyn Read + Send>) {
        let sessions = Arc::clone(&self.sessions);

        std::thread::spawn(move || {
            let output_event = format!("pty_output_{}", session_id);
            let exit_event = format!("pty_exit_{}", session_id);
            let mut buf = [0u8; 8192];

            loop {
                match reader.read(&mut buf) {
                    Ok(0) => break,
                    Ok(n) => {
                        let chunk = String::from_utf8_lossy(&buf[..n]).to_string();
                        emit(output_event.clone(), chunk);
                    }
                    Err(_) => break,
                }
            }

            // The child exited (or the pipe closed): reap it for the exit code
            // and drop the session from the registry.
            let code = {
                let mut guard = sessions.lock().unwrap();
                match guard.remove(&session_id) {
                    Some(mut session) => session
                        .child
                        .wait()
                        .map(|status| status.exit_code() as i32)
                        .unwrap_or(-1),
                    None => -1,
                }
            };
            emit(exit_event, code.to_string());
        });
    }

    pub fn write(&self, session_id: &str, data: &str) -> Result<(), String> {
        let mut sessions = self.sessions.lock().unwrap();
        let session = sessions
            .get_mut(session_id)
            .ok_or_else(|| format!("Unknown PTY session: {}", session_id))?;

        // Normalize non-breaking spaces (\u{00A0}, \u{202F}) and other Unicode spaces to ASCII 0x20,
        // and strip zero-width characters so bash / shells do not treat "cd code" as a single token.
        let sanitized = data
            .replace('\u{00A0}', " ")
            .replace('\u{202F}', " ")
            .replace('\u{3000}', " ")
            .replace('\u{1680}', " ")
            .replace('\u{200B}', "")
            .replace('\u{200C}', "")
            .replace('\u{200D}', "")
            .replace('\u{FEFF}', "");

        session
            .writer
            .write_all(sanitized.as_bytes())
            .map_err(|e| e.to_string())?;
        session.writer.flush().map_err(|e| e.to_string())
    }

    pub fn resize(&self, session_id: &str, cols: u16, rows: u16) -> Result<(), String> {
        let sessions = self.sessions.lock().unwrap();
        let session = sessions
            .get(session_id)
            .ok_or_else(|| format!("Unknown PTY session: {}", session_id))?;
        session
            .master
            .resize(PtySize {
                rows,
                cols,
                pixel_width: 0,
                pixel_height: 0,
            })
            .map_err(|e| e.to_string())
    }

    pub fn kill(&self, session_id: &str) -> Result<(), String> {
        let mut sessions = self.sessions.lock().unwrap();
        if let Some(mut session) = sessions.remove(session_id) {
            let _ = session.child.kill();
            let _ = session.child.wait();
        }
        Ok(())
    }

    /// Retrieve the current working directory of the process backing the given session.
    pub fn get_cwd(&self, session_id: &str) -> Option<String> {
        let sessions = self.sessions.lock().unwrap();
        let session = sessions.get(session_id)?;
        let pid = session.child.process_id()?;

        #[cfg(target_os = "linux")]
        {
            if let Ok(link) = std::fs::read_link(format!("/proc/{}/cwd", pid)) {
                return Some(link.to_string_lossy().to_string());
            }
        }

        #[cfg(target_os = "windows")]
        {
            if let Some(cwd) = get_windows_process_cwd(pid) {
                return Some(cwd);
            }
        }

        None
    }

    /// Kill every tracked session. Used on application shutdown.
    pub fn kill_all(&self) {
        let mut sessions = self.sessions.lock().unwrap();
        for (_, mut session) in sessions.drain() {
            let _ = session.child.kill();
            let _ = session.child.wait();
        }
    }
}

#[cfg(target_os = "windows")]
fn get_windows_process_cwd(pid: u32) -> Option<String> {
    use std::ffi::c_void;
    use std::mem;

    type HANDLE = *mut c_void;

    #[repr(C)]
    struct UNICODE_STRING {
        length: u16,
        maximum_length: u16,
        buffer: *mut u16,
    }

    #[repr(C)]
    struct PROCESS_BASIC_INFORMATION {
        exit_status: i32,
        peb_base_address: *mut c_void,
        affinity_mask: usize,
        base_priority: i32,
        unique_process_id: usize,
        inherited_from_unique_process_id: usize,
    }

    #[link(name = "kernel32")]
    extern "system" {
        fn OpenProcess(dwDesiredAccess: u32, bInheritHandle: i32, dwProcessId: u32) -> HANDLE;
        fn ReadProcessMemory(
            hProcess: HANDLE,
            lpBaseAddress: *const c_void,
            lpBuffer: *mut c_void,
            nSize: usize,
            lpNumberOfBytesRead: *mut usize,
        ) -> i32;
        fn CloseHandle(hObject: HANDLE) -> i32;
    }

    #[link(name = "ntdll")]
    extern "system" {
        fn NtQueryInformationProcess(
            ProcessHandle: HANDLE,
            ProcessInformationClass: u32,
            ProcessInformation: *mut c_void,
            ProcessInformationLength: u32,
            ReturnLength: *mut u32,
        ) -> i32;
    }

    unsafe {
        const PROCESS_QUERY_INFORMATION: u32 = 0x0400;
        const PROCESS_VM_READ: u32 = 0x0010;

        let handle = OpenProcess(PROCESS_QUERY_INFORMATION | PROCESS_VM_READ, 0, pid);
        if handle.is_null() {
            return None;
        }

        let mut pbi: PROCESS_BASIC_INFORMATION = mem::zeroed();
        let mut return_length = 0u32;
        let status = NtQueryInformationProcess(
            handle,
            0, // ProcessBasicInformation
            &mut pbi as *mut _ as *mut c_void,
            mem::size_of::<PROCESS_BASIC_INFORMATION>() as u32,
            &mut return_length,
        );

        if status < 0 || pbi.peb_base_address.is_null() {
            CloseHandle(handle);
            return None;
        }

        #[cfg(target_pointer_width = "64")]
        let process_parameters_offset = 0x20usize;
        #[cfg(target_pointer_width = "32")]
        let process_parameters_offset = 0x10usize;

        let mut process_parameters: *mut c_void = std::ptr::null_mut();
        let mut read_bytes = 0usize;
        let ok = ReadProcessMemory(
            handle,
            pbi.peb_base_address.add(process_parameters_offset) as *const c_void,
            &mut process_parameters as *mut _ as *mut c_void,
            mem::size_of::<*mut c_void>(),
            &mut read_bytes,
        );

        if ok == 0 || process_parameters.is_null() {
            CloseHandle(handle);
            return None;
        }

        #[cfg(target_pointer_width = "64")]
        let current_directory_offset = 0x38usize;
        #[cfg(target_pointer_width = "32")]
        let current_directory_offset = 0x24usize;

        let mut cwd_unicode: UNICODE_STRING = mem::zeroed();
        let ok = ReadProcessMemory(
            handle,
            process_parameters.add(current_directory_offset) as *const c_void,
            &mut cwd_unicode as *mut _ as *mut c_void,
            mem::size_of::<UNICODE_STRING>(),
            &mut read_bytes,
        );

        if ok == 0 || cwd_unicode.length == 0 || cwd_unicode.buffer.is_null() {
            CloseHandle(handle);
            return None;
        }

        let len_u16 = (cwd_unicode.length / 2) as usize;
        let mut buf = vec![0u16; len_u16];
        let ok = ReadProcessMemory(
            handle,
            cwd_unicode.buffer as *const c_void,
            buf.as_mut_ptr() as *mut c_void,
            cwd_unicode.length as usize,
            &mut read_bytes,
        );

        CloseHandle(handle);

        if ok == 0 {
            return None;
        }

        String::from_utf16(&buf).ok().map(|s| {
            s.trim_end_matches('\\').to_string()
        })
    }
}

#[cfg(all(test, unix))]
mod tests {
    use super::*;
    use std::sync::mpsc;
    use std::time::{Duration, Instant};

    /// Spawn a real shell, type a command, and assert the output streams back.
    #[test]
    fn spawns_shell_and_streams_output() {
        let manager = PtyManager::new();
        let (tx, rx) = mpsc::channel::<(String, String)>();

        let emitter: EventEmitter = Box::new(move |event, payload| {
            let _ = tx.send((event, payload));
        });

        manager
            .spawn_with(emitter, "test-session".to_string(), None, None, 80, 24)
            .expect("spawn should succeed");

        // Give the shell a moment to come up, then inject a command.
        std::thread::sleep(Duration::from_millis(400));
        manager
            .write("test-session", "echo vibeterm-ok\n")
            .expect("write should succeed");

        let deadline = Instant::now() + Duration::from_secs(6);
        let mut collected = String::new();
        while Instant::now() < deadline {
            match rx.recv_timeout(Duration::from_millis(500)) {
                Ok((_event, payload)) => {
                    collected.push_str(&payload);
                    if collected.contains("vibeterm-ok") {
                        break;
                    }
                }
                Err(mpsc::RecvTimeoutError::Timeout) => continue,
                Err(mpsc::RecvTimeoutError::Disconnected) => break,
            }
        }

        manager.kill("test-session").ok();

        assert!(
            collected.contains("vibeterm-ok"),
            "expected PTY output to contain the marker, got: {collected:?}"
        );
    }

    #[test]
    fn write_to_unknown_session_errors() {
        let manager = PtyManager::new();
        assert!(manager.write("missing", "x").is_err());
        assert!(manager.resize("missing", 80, 24).is_err());
        assert!(manager.kill("missing").is_ok());
    }

    #[test]
    fn get_cwd_returns_working_directory() {
        let manager = PtyManager::new();
        let emitter: EventEmitter = Box::new(|_, _| {});
        manager
            .spawn_with(emitter, "test-cwd".to_string(), None, None, 80, 24)
            .expect("spawn should succeed");

        std::thread::sleep(Duration::from_millis(300));
        let cwd = manager.get_cwd("test-cwd");
        manager.kill("test-cwd").ok();

        assert!(cwd.is_some(), "expected get_cwd to return Some path");
    }
}
