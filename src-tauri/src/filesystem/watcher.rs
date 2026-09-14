use crate::error::{CommandError, CommandResult};
use notify::{Event, RecommendedWatcher, RecursiveMode, Watcher};
use serde::Serialize;
use std::{
    collections::{HashMap, HashSet},
    path::{Component, Path, PathBuf},
    sync::{mpsc, Arc, Mutex, MutexGuard},
    thread::{self, JoinHandle},
    time::{Duration, Instant},
};
use uuid::Uuid;

const DEBOUNCE: Duration = Duration::from_millis(120);
const MAX_PATHS: usize = 256;

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FilesystemChanged {
    pub worktree_id: Uuid,
    pub paths: Vec<String>,
    pub truncated: bool,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitChanged {
    pub worktree_id: Uuid,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub enum WatchEvent {
    Filesystem(FilesystemChanged),
    Git(GitChanged),
}

pub type EventSink = Arc<dyn Fn(WatchEvent) + Send + Sync + 'static>;

struct WatchSession {
    _watcher: RecommendedWatcher,
    stop: mpsc::Sender<()>,
    worker: Option<JoinHandle<()>>,
}

impl WatchSession {
    fn stop(mut self) {
        let _ = self.stop.send(());
        if let Some(worker) = self.worker.take() {
            let _ = worker.join();
        }
    }
}

#[derive(Default)]
pub struct WatcherRegistry {
    sessions: Mutex<HashMap<Uuid, WatchSession>>,
}

impl WatcherRegistry {
    pub fn ensure(
        &self,
        worktree_id: Uuid,
        root: PathBuf,
        git_dir: PathBuf,
        sink: EventSink,
    ) -> CommandResult<()> {
        let mut sessions = self.lock()?;
        if sessions.contains_key(&worktree_id) {
            return Ok(());
        }
        let root = root.canonicalize().map_err(CommandError::io)?;
        let git_dir = git_dir.canonicalize().unwrap_or(git_dir);
        let (event_tx, event_rx) = mpsc::channel();
        let mut watcher = notify::recommended_watcher(move |event| {
            let _ = event_tx.send(event);
        })
        .map_err(watcher_error)?;
        watcher
            .watch(&root, RecursiveMode::Recursive)
            .map_err(watcher_error)?;
        if git_dir.exists() && !git_dir.starts_with(&root) {
            watcher
                .watch(&git_dir, RecursiveMode::Recursive)
                .map_err(watcher_error)?;
        }
        let (stop_tx, stop_rx) = mpsc::channel();
        let worker = thread::spawn(move || worker_loop(worktree_id, root, event_rx, stop_rx, sink));
        sessions.insert(
            worktree_id,
            WatchSession {
                _watcher: watcher,
                stop: stop_tx,
                worker: Some(worker),
            },
        );
        Ok(())
    }

    pub fn close(&self, worktree_id: Uuid) -> CommandResult<()> {
        if let Some(session) = self.lock()?.remove(&worktree_id) {
            session.stop();
        }
        Ok(())
    }

    #[cfg(test)]
    fn contains(&self, project_id: Uuid) -> bool {
        self.sessions
            .lock()
            .is_ok_and(|sessions| sessions.contains_key(&project_id))
    }

    fn lock(&self) -> CommandResult<MutexGuard<'_, HashMap<Uuid, WatchSession>>> {
        self.sessions
            .lock()
            .map_err(|_| CommandError::new("INVALID_ARGUMENT", "watcher registry lock poisoned"))
    }
}

impl Drop for WatcherRegistry {
    fn drop(&mut self) {
        if let Ok(sessions) = self.sessions.get_mut() {
            for (_, session) in sessions.drain() {
                session.stop();
            }
        }
    }
}

fn worker_loop(
    project_id: Uuid,
    root: PathBuf,
    events: mpsc::Receiver<notify::Result<Event>>,
    stop: mpsc::Receiver<()>,
    sink: EventSink,
) {
    loop {
        if stop.try_recv().is_ok() {
            return;
        }
        let first = match events.recv_timeout(Duration::from_millis(50)) {
            Ok(event) => event,
            Err(mpsc::RecvTimeoutError::Timeout) => continue,
            Err(mpsc::RecvTimeoutError::Disconnected) => return,
        };
        let deadline = Instant::now() + DEBOUNCE;
        let mut batch = vec![first];
        loop {
            if stop.try_recv().is_ok() {
                return;
            }
            let Some(remaining) = deadline.checked_duration_since(Instant::now()) else {
                break;
            };
            match events.recv_timeout(remaining) {
                Ok(event) => batch.push(event),
                Err(mpsc::RecvTimeoutError::Timeout) => break,
                Err(mpsc::RecvTimeoutError::Disconnected) => break,
            }
        }
        let (filesystem, git_changed) = build_events(project_id, &root, batch);
        if let Some(payload) = filesystem {
            sink(WatchEvent::Filesystem(payload));
        }
        if git_changed {
            sink(WatchEvent::Git(GitChanged {
                worktree_id: project_id,
            }));
        }
    }
}

fn build_events(
    project_id: Uuid,
    root: &Path,
    events: impl IntoIterator<Item = notify::Result<Event>>,
) -> (Option<FilesystemChanged>, bool) {
    let mut paths = HashSet::new();
    let mut truncated = false;
    let mut git_changed = false;
    for event in events {
        let event = match event {
            Ok(event) => event,
            Err(_) => {
                truncated = true;
                git_changed = true;
                continue;
            }
        };
        for path in event.paths {
            let Ok(relative) = path.strip_prefix(root) else {
                git_changed = true;
                continue;
            };
            if is_git_path(relative) {
                git_changed = true;
                continue;
            }
            if relative.components().next().is_some_and(
                |component| matches!(component, Component::Normal(value) if value == ".git"),
            ) {
                continue;
            }
            git_changed = true;
            if paths.len() == MAX_PATHS {
                truncated = true;
            } else {
                paths.insert(relative.to_string_lossy().into_owned());
            }
        }
    }
    let filesystem = if paths.is_empty() && !truncated {
        None
    } else {
        let mut paths: Vec<_> = paths.into_iter().collect();
        paths.sort();
        Some(FilesystemChanged {
            worktree_id: project_id,
            paths,
            truncated,
        })
    };
    (filesystem, git_changed)
}

fn is_git_path(relative: &Path) -> bool {
    let parts: Vec<_> = relative.components().collect();
    if !matches!(parts.first(), Some(Component::Normal(value)) if *value == ".git") {
        return false;
    }
    matches!(
        parts.get(1),
        Some(Component::Normal(value)) if *value == "index" || *value == "HEAD" || *value == "packed-refs" || *value == "refs"
    )
}

fn watcher_error(error: notify::Error) -> CommandError {
    CommandError::new(
        "INVALID_ARGUMENT",
        format!("filesystem watcher failed: {error}"),
    )
}

#[cfg(test)]
mod tests {
    use super::*;
    use notify::{event::ModifyKind, EventKind};
    use std::{
        fs,
        time::{SystemTime, UNIX_EPOCH},
    };

    fn temp() -> PathBuf {
        std::env::temp_dir().join(format!(
            "spirecode-watcher-{}",
            SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ))
    }

    fn event(root: &Path, paths: &[&str]) -> notify::Result<Event> {
        Ok(Event::new(EventKind::Modify(ModifyKind::Any))
            .add_path(root.join(paths[0]))
            .add_path(root.join(paths[1])))
    }

    #[test]
    fn separates_filesystem_git_metadata_and_noise() {
        let root = PathBuf::from("/repo");
        let id = Uuid::new_v4();
        let (filesystem, git) = build_events(
            id,
            &root,
            [
                event(&root, &["src/a.rs", ".git/index"]),
                event(&root, &[".git/refs/heads/main", ".git/objects/noise"]),
            ],
        );
        assert_eq!(filesystem.unwrap().paths, ["src/a.rs"]);
        assert!(git);
        let (filesystem, git) = build_events(
            id,
            &root,
            [event(&root, &[".git/logs/HEAD", ".git/objects/noise"])],
        );
        assert!(filesystem.is_none());
        assert!(!git);
    }

    #[test]
    fn payload_truncates() {
        let root = PathBuf::from("/repo");
        let id = Uuid::new_v4();
        let events = (0..=MAX_PATHS).map(|index| {
            Ok(Event::new(EventKind::Modify(ModifyKind::Any))
                .add_path(root.join(format!("{index}.txt"))))
        });
        let (payload, git) = build_events(id, &root, events);
        assert_eq!(payload.as_ref().unwrap().paths.len(), MAX_PATHS);
        assert!(payload.unwrap().truncated);
        assert!(git);
    }

    #[test]
    fn registry_emits_debounced_changes_and_stops() {
        let root = temp();
        fs::create_dir_all(&root).unwrap();
        let id = Uuid::new_v4();
        let (tx, rx) = mpsc::channel();
        let registry = WatcherRegistry::default();
        registry
            .ensure(
                id,
                root.clone(),
                root.join(".git"),
                Arc::new(move |payload| {
                    let _ = tx.send(payload);
                }),
            )
            .unwrap();
        registry
            .ensure(id, root.clone(), root.join(".git"), Arc::new(|_| {}))
            .unwrap();
        assert!(registry.contains(id));
        fs::write(root.join("one.txt"), "one").unwrap();
        fs::write(root.join("two.txt"), "two").unwrap();
        let mut filesystem = None;
        for _ in 0..2 {
            match rx.recv_timeout(Duration::from_secs(5)).unwrap() {
                WatchEvent::Filesystem(payload) => filesystem = Some(payload),
                WatchEvent::Git(_) => {}
            }
        }
        let payload = filesystem.unwrap();
        assert!(payload.paths.iter().any(|path| path == "one.txt"));
        assert!(payload.paths.iter().any(|path| path == "two.txt"));
        registry.close(id).unwrap();
        assert!(!registry.contains(id));
        fs::remove_dir_all(root).unwrap();
    }
}
