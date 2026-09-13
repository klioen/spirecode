use crate::error::{CommandError, CommandResult};
use portable_pty::{native_pty_system, Child, CommandBuilder, MasterPty, PtySize};
use serde::Serialize;
use std::{
    collections::{HashMap, VecDeque},
    io::{Read, Write},
    path::Path,
    sync::{mpsc, Arc, Mutex, MutexGuard},
    thread,
    time::{Duration, Instant},
};
use tauri::ipc::Channel;
use uuid::Uuid;

const MIN_DIMENSION: u16 = 1;
const MAX_DIMENSION: u16 = 1000;
const READ_CHUNK: usize = 8192;
const BATCH_WINDOW: Duration = Duration::from_millis(6);

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TerminalSummary {
    pub terminal_id: Uuid,
    pub project_id: Uuid,
    pub cols: u16,
    pub rows: u16,
}
#[derive(Clone, Debug, Serialize)]
#[serde(
    tag = "type",
    rename_all = "lowercase",
    rename_all_fields = "camelCase"
)]
pub enum TerminalEvent {
    Output {
        terminal_id: Uuid,
        data: Vec<u8>,
    },
    Exit {
        terminal_id: Uuid,
        exit_code: Option<u32>,
    },
    Error {
        terminal_id: Uuid,
        error: String,
    },
}

struct Session {
    summary: TerminalSummary,
    master: Box<dyn MasterPty + Send>,
    writer: Box<dyn Write + Send>,
    child: Box<dyn Child + Send + Sync>,
    channel: Option<Channel<TerminalEvent>>,
    pending: VecDeque<Vec<u8>>,
    exit_code: Option<Option<u32>>,
}
#[derive(Default)]
pub struct TerminalRegistry {
    sessions: Arc<Mutex<HashMap<Uuid, Session>>>,
}

impl TerminalRegistry {
    pub fn create(
        &self,
        project_id: Uuid,
        cwd: &Path,
        cols: u16,
        rows: u16,
    ) -> CommandResult<TerminalSummary> {
        validate_size(cols, rows)?;
        let pair = native_pty_system()
            .openpty(PtySize {
                rows,
                cols,
                pixel_width: 0,
                pixel_height: 0,
            })
            .map_err(terminal_error)?;
        let mut command = CommandBuilder::new(valid_shell());
        command.cwd(cwd);
        let child = pair.slave.spawn_command(command).map_err(terminal_error)?;
        drop(pair.slave);
        let mut reader = pair.master.try_clone_reader().map_err(terminal_error)?;
        let writer = pair.master.take_writer().map_err(terminal_error)?;
        let terminal_id = Uuid::new_v4();
        let summary = TerminalSummary {
            terminal_id,
            project_id,
            cols,
            rows,
        };
        self.lock()?.insert(
            terminal_id,
            Session {
                summary: summary.clone(),
                master: pair.master,
                writer,
                child,
                channel: None,
                pending: VecDeque::new(),
                exit_code: None,
            },
        );
        let (tx, rx) = mpsc::channel();
        thread::spawn(move || read_pty(&mut reader, tx));
        let sessions = Arc::clone(&self.sessions);
        thread::spawn(move || forward_batches(terminal_id, sessions, rx));
        Ok(summary)
    }

    pub fn attach(&self, id: Uuid, channel: Channel<TerminalEvent>) -> CommandResult<()> {
        let mut sessions = self.lock()?;
        let session = sessions.get_mut(&id).ok_or_else(not_found)?;
        while let Some(data) = session.pending.front() {
            channel
                .send(TerminalEvent::Output {
                    terminal_id: id,
                    data: data.clone(),
                })
                .map_err(terminal_error)?;
            session.pending.pop_front();
        }
        if let Some(exit_code) = session.exit_code {
            channel
                .send(TerminalEvent::Exit {
                    terminal_id: id,
                    exit_code,
                })
                .map_err(terminal_error)?;
        }
        session.channel = Some(channel);
        Ok(())
    }

    pub fn write(&self, id: Uuid, data: &str) -> CommandResult<()> {
        let mut sessions = self.lock()?;
        let session = sessions.get_mut(&id).ok_or_else(not_found)?;
        session
            .writer
            .write_all(data.as_bytes())
            .and_then(|_| session.writer.flush())
            .map_err(terminal_error)
    }
    pub fn resize(&self, id: Uuid, cols: u16, rows: u16) -> CommandResult<()> {
        validate_size(cols, rows)?;
        let mut sessions = self.lock()?;
        let session = sessions.get_mut(&id).ok_or_else(not_found)?;
        session
            .master
            .resize(PtySize {
                rows,
                cols,
                pixel_width: 0,
                pixel_height: 0,
            })
            .map_err(terminal_error)?;
        session.summary.cols = cols;
        session.summary.rows = rows;
        Ok(())
    }
    pub fn close(&self, id: Uuid, force: bool) -> CommandResult<()> {
        let mut sessions = self.lock()?;
        let session = sessions.get_mut(&id).ok_or_else(not_found)?;
        if !force && session.child.try_wait().map_err(terminal_error)?.is_none() {
            return Err(
                CommandError::new("TERMINAL_FAILED", "terminal is still running")
                    .detail("busy", "true"),
            );
        }
        let mut session = sessions.remove(&id).ok_or_else(not_found)?;
        if session.child.try_wait().map_err(terminal_error)?.is_none() {
            session.child.kill().map_err(terminal_error)?;
        }
        Ok(())
    }
    pub fn list(&self, project_id: Option<Uuid>) -> CommandResult<Vec<TerminalSummary>> {
        Ok(self
            .lock()?
            .values()
            .filter(|session| project_id.is_none_or(|id| session.summary.project_id == id))
            .map(|session| session.summary.clone())
            .collect())
    }
    pub fn close_project(&self, project_id: Uuid) {
        if let Ok(mut sessions) = self.sessions.lock() {
            let ids: Vec<_> = sessions
                .iter()
                .filter(|(_, session)| session.summary.project_id == project_id)
                .map(|(id, _)| *id)
                .collect();
            for id in ids {
                if let Some(mut session) = sessions.remove(&id) {
                    let _ = session.child.kill();
                }
            }
        }
    }
    fn lock(&self) -> CommandResult<MutexGuard<'_, HashMap<Uuid, Session>>> {
        self.sessions
            .lock()
            .map_err(|_| CommandError::new("TERMINAL_FAILED", "terminal registry lock poisoned"))
    }
}

fn read_pty(reader: &mut dyn Read, tx: mpsc::Sender<Result<Vec<u8>, String>>) {
    let mut buffer = [0_u8; READ_CHUNK];
    loop {
        match reader.read(&mut buffer) {
            Ok(0) => break,
            Ok(count) => {
                if tx.send(Ok(buffer[..count].to_vec())).is_err() {
                    return;
                }
            }
            Err(error) => {
                let _ = tx.send(Err(error.to_string()));
                return;
            }
        }
    }
}

fn forward_batches(
    terminal_id: Uuid,
    sessions: Arc<Mutex<HashMap<Uuid, Session>>>,
    rx: mpsc::Receiver<Result<Vec<u8>, String>>,
) {
    while let Ok(first) = rx.recv() {
        let mut batch = match first {
            Ok(data) => data,
            Err(error) => {
                send_error(&sessions, terminal_id, error);
                break;
            }
        };
        let deadline = Instant::now() + BATCH_WINDOW;
        while let Some(remaining) = deadline.checked_duration_since(Instant::now()) {
            match rx.recv_timeout(remaining) {
                Ok(Ok(data)) => batch.extend(data),
                Ok(Err(error)) => {
                    send_error(&sessions, terminal_id, error);
                    break;
                }
                Err(mpsc::RecvTimeoutError::Timeout) => break,
                Err(mpsc::RecvTimeoutError::Disconnected) => break,
            }
        }
        if let Ok(mut map) = sessions.lock() {
            let Some(session) = map.get_mut(&terminal_id) else {
                return;
            };
            if let Some(channel) = &session.channel {
                if channel
                    .send(TerminalEvent::Output {
                        terminal_id,
                        data: batch.clone(),
                    })
                    .is_err()
                {
                    session.channel = None;
                    session.pending.push_back(batch);
                }
            } else {
                session.pending.push_back(batch);
            }
        } else {
            return;
        }
    }
    if let Ok(mut map) = sessions.lock() {
        if let Some(session) = map.get_mut(&terminal_id) {
            let exit_code = session.child.wait().ok().map(|status| status.exit_code());
            session.exit_code = Some(exit_code);
            if let Some(channel) = &session.channel {
                let _ = channel.send(TerminalEvent::Exit {
                    terminal_id,
                    exit_code,
                });
            }
        }
    }
}

fn send_error(sessions: &Arc<Mutex<HashMap<Uuid, Session>>>, id: Uuid, error: String) {
    if let Ok(map) = sessions.lock() {
        if let Some(channel) = map.get(&id).and_then(|session| session.channel.as_ref()) {
            let _ = channel.send(TerminalEvent::Error {
                terminal_id: id,
                error,
            });
        }
    }
}

impl Drop for TerminalRegistry {
    fn drop(&mut self) {
        if let Ok(mut sessions) = self.sessions.lock() {
            for (_, mut session) in sessions.drain() {
                let _ = session.child.kill();
            }
        }
    }
}
fn validate_size(cols: u16, rows: u16) -> CommandResult<()> {
    if (MIN_DIMENSION..=MAX_DIMENSION).contains(&cols)
        && (MIN_DIMENSION..=MAX_DIMENSION).contains(&rows)
    {
        Ok(())
    } else {
        Err(CommandError::new(
            "INVALID_ARGUMENT",
            "terminal dimensions must be between 1 and 1000",
        ))
    }
}
fn valid_shell() -> String {
    std::env::var("SHELL")
        .ok()
        .filter(|shell| Path::new(shell).is_absolute() && Path::new(shell).is_file())
        .unwrap_or_else(|| {
            if Path::new("/bin/zsh").is_file() {
                "/bin/zsh".into()
            } else {
                "/bin/sh".into()
            }
        })
}
fn terminal_error(error: impl std::fmt::Display) -> CommandError {
    CommandError::new("TERMINAL_FAILED", error.to_string())
}
fn not_found() -> CommandError {
    CommandError::new("TERMINAL_NOT_FOUND", "terminal not found")
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::{
        fs,
        sync::mpsc,
        time::{SystemTime, UNIX_EPOCH},
    };
    use tauri::ipc::InvokeResponseBody;

    fn cwd() -> std::path::PathBuf {
        let path = std::env::temp_dir().join(format!(
            "pi-app-terminal-{}",
            SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        fs::create_dir_all(&path).unwrap();
        path
    }

    #[test]
    fn buffers_initial_output_until_attach_and_preserves_bytes() {
        let cwd = cwd();
        let registry = TerminalRegistry::default();
        let summary = registry.create(Uuid::new_v4(), &cwd, 80, 24).unwrap();
        registry
            .write(summary.terminal_id, "printf '\\303\\251ready'\r")
            .unwrap();
        thread::sleep(Duration::from_millis(100));
        let (tx, rx) = mpsc::channel();
        let channel = Channel::new(move |body: InvokeResponseBody| {
            tx.send(body).unwrap();
            Ok(())
        });
        registry.attach(summary.terminal_id, channel).unwrap();
        let mut serialized = String::new();
        let deadline = Instant::now() + Duration::from_secs(5);
        while !(serialized.contains("195") && serialized.contains("169")) {
            let remaining = deadline
                .checked_duration_since(Instant::now())
                .expect("timed out waiting for terminal output");
            if let InvokeResponseBody::Json(value) = rx.recv_timeout(remaining).unwrap() {
                serialized.push_str(&value);
            }
        }
        registry.resize(summary.terminal_id, 100, 30).unwrap();
        registry.close(summary.terminal_id, true).unwrap();
        fs::remove_dir_all(cwd).unwrap();
    }

    #[test]
    fn validates_terminal_dimensions() {
        assert!(validate_size(80, 24).is_ok());
        assert_eq!(validate_size(0, 24).unwrap_err().code, "INVALID_ARGUMENT");
    }
    #[test]
    fn empty_registry_lifecycle() {
        let registry = TerminalRegistry::default();
        assert!(registry.list(None).unwrap().is_empty());
        assert_eq!(
            registry.write(Uuid::new_v4(), "x").unwrap_err().code,
            "TERMINAL_NOT_FOUND"
        );
    }
}
