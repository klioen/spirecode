use crate::{
    error::{CommandError, CommandResult},
    filesystem,
    projects::ProjectService,
};
use serde::Serialize;
use std::{
    collections::{BTreeMap, HashMap},
    io::Read,
    path::Path,
    process::{Command, ExitStatus, Stdio},
    sync::{Arc, Mutex},
    thread,
    time::{Duration, Instant},
};
use uuid::Uuid;

const GIT_TIMEOUT: Duration = Duration::from_secs(15);
const MAX_GIT_OUTPUT: usize = 20 * 1024 * 1024;

#[derive(Clone, Debug, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct GitChange {
    pub path: String,
    pub original_path: Option<String>,
    pub staged: bool,
    pub unstaged: bool,
    pub untracked: bool,
    pub status: String,
    pub additions: Option<u64>,
    pub deletions: Option<u64>,
}
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitStatus {
    pub branch: Option<String>,
    pub upstream: Option<String>,
    pub ahead: u64,
    pub behind: u64,
    pub changes: Vec<GitChange>,
}
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitDiff {
    pub path: String,
    pub scope: String,
    pub original: Option<String>,
    pub modified: Option<String>,
    pub patch: Option<String>,
}

#[derive(Default)]
pub struct GitService {
    locks: Mutex<HashMap<Uuid, Arc<Mutex<()>>>>,
}

impl GitService {
    pub fn status(&self, projects: &ProjectService, id: Uuid) -> CommandResult<GitStatus> {
        let lock = self.project_lock(id)?;
        let _guard = lock
            .lock()
            .map_err(|_| CommandError::new("GIT_FAILED", "project Git lock poisoned"))?;
        status(projects, id)
    }

    pub fn diff_file(
        &self,
        projects: &ProjectService,
        id: Uuid,
        relative: &str,
        scope: &str,
    ) -> CommandResult<GitDiff> {
        let lock = self.project_lock(id)?;
        let _guard = lock
            .lock()
            .map_err(|_| CommandError::new("GIT_FAILED", "project Git lock poisoned"))?;
        diff_file(projects, id, relative, scope)
    }

    pub fn close_project(&self, id: Uuid) {
        if let Ok(mut locks) = self.locks.lock() {
            locks.remove(&id);
        }
    }

    fn project_lock(&self, id: Uuid) -> CommandResult<Arc<Mutex<()>>> {
        Ok(Arc::clone(
            self.locks
                .lock()
                .map_err(|_| CommandError::new("GIT_FAILED", "Git lock registry poisoned"))?
                .entry(id)
                .or_default(),
        ))
    }
}

fn status(projects: &ProjectService, id: Uuid) -> CommandResult<GitStatus> {
    let root = projects.root(id)?;
    let output = run_git(
        &root,
        &[
            "status",
            "--porcelain=v2",
            "--branch",
            "-z",
            "--untracked-files=all",
        ],
    )?;
    let mut status = parse_status(&output)?;
    let staged = run_git(
        &root,
        &["diff", "--cached", "--numstat", "-z", "--no-ext-diff"],
    )?;
    let unstaged = run_git(&root, &["diff", "--numstat", "-z", "--no-ext-diff"])?;
    apply_numstat(&mut status.changes, &staged);
    apply_numstat(&mut status.changes, &unstaged);
    Ok(status)
}

fn diff_file(
    projects: &ProjectService,
    id: Uuid,
    relative: &str,
    scope: &str,
) -> CommandResult<GitDiff> {
    let root = projects.root(id)?;
    filesystem::resolve(&root, relative, false)?;
    let index_spec = format!(":./{relative}");
    let head_spec = format!("HEAD:./{relative}");
    let (original, modified, patch) = match scope {
        "staged" => (
            read_git_object(&root, &head_spec)?,
            read_git_object(&root, &index_spec)?,
            Some(run_git(
                &root,
                &["diff", "--cached", "--no-ext-diff", "--", relative],
            )?),
        ),
        "unstaged" => (
            read_git_object(&root, &index_spec)?,
            read_worktree_file(projects, id, relative)?,
            Some(run_git(&root, &["diff", "--no-ext-diff", "--", relative])?),
        ),
        "untracked" => {
            let modified = read_worktree_file(projects, id, relative)?;
            let patch = modified
                .as_ref()
                .map(|content| untracked_patch(relative, content));
            (None, modified, patch)
        }
        _ => {
            return Err(CommandError::new(
                "INVALID_ARGUMENT",
                "diff scope must be staged, unstaged, or untracked",
            ))
        }
    };
    Ok(GitDiff {
        path: relative.into(),
        scope: scope.into(),
        original,
        modified,
        patch,
    })
}

fn read_worktree_file(
    projects: &ProjectService,
    id: Uuid,
    relative: &str,
) -> CommandResult<Option<String>> {
    match filesystem::read_file(projects, id, relative) {
        Ok(file) => Ok(Some(file.content)),
        Err(error) if error.code == "NOT_FOUND" => Ok(None),
        Err(error) => Err(error),
    }
}

fn read_git_object(root: &Path, spec: &str) -> CommandResult<Option<String>> {
    if !git_object_exists(root, spec)? {
        return Ok(None);
    }
    run_git(root, &["show", spec]).map(Some)
}

fn git_object_exists(root: &Path, spec: &str) -> CommandResult<bool> {
    let output = run_git_raw(root, &["cat-file", "-e", spec])?;
    Ok(output.status.success())
}

fn untracked_patch(relative: &str, content: &str) -> String {
    format!(
        "--- /dev/null\n+++ b/{relative}\n@@ -0,0 +1,{} @@\n{}",
        content.lines().count(),
        content
            .lines()
            .map(|line| format!("+{line}\n"))
            .collect::<String>()
    )
}

struct GitOutput {
    status: ExitStatus,
    stdout: Vec<u8>,
    stderr: Vec<u8>,
}

fn safe_command(root: &Path) -> Command {
    let mut command = Command::new("git");
    command.current_dir(root).args([
        "-c",
        "core.hooksPath=/dev/null",
        "-c",
        "credential.helper=",
        "-c",
        "protocol.ext.allow=never",
        "-c",
        "diff.external=",
    ]);
    command
}

fn run_git(root: &Path, args: &[&str]) -> CommandResult<String> {
    let output = run_git_raw(root, args)?;
    if !output.status.success() {
        return Err(CommandError::new(
            "GIT_FAILED",
            String::from_utf8_lossy(&output.stderr).trim(),
        )
        .detail(
            "exitCode",
            output
                .status
                .code()
                .map_or_else(|| "signal".into(), |code| code.to_string()),
        ));
    }
    String::from_utf8(output.stdout)
        .map_err(|_| CommandError::new("UNSUPPORTED_FILE", "Git object is not valid UTF-8"))
}

fn run_git_raw(root: &Path, args: &[&str]) -> CommandResult<GitOutput> {
    let mut child = safe_command(root)
        .args(args)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(CommandError::io)?;
    let stdout = child
        .stdout
        .take()
        .ok_or_else(|| CommandError::new("GIT_FAILED", "missing Git stdout"))?;
    let stderr = child
        .stderr
        .take()
        .ok_or_else(|| CommandError::new("GIT_FAILED", "missing Git stderr"))?;
    let stdout_reader = thread::spawn(move || read_limited(stdout));
    let stderr_reader = thread::spawn(move || read_limited(stderr));
    let start = Instant::now();
    let status = loop {
        match child.try_wait().map_err(CommandError::io)? {
            Some(status) => break status,
            None if start.elapsed() >= GIT_TIMEOUT => {
                child.kill().map_err(CommandError::io)?;
                let _ = child.wait();
                return Err(CommandError::new("GIT_TIMED_OUT", "Git command timed out"));
            }
            None => thread::sleep(Duration::from_millis(10)),
        }
    };
    let stdout = stdout_reader
        .join()
        .map_err(|_| CommandError::new("GIT_FAILED", "Git stdout reader panicked"))??;
    let stderr = stderr_reader
        .join()
        .map_err(|_| CommandError::new("GIT_FAILED", "Git stderr reader panicked"))??;
    Ok(GitOutput {
        status,
        stdout,
        stderr,
    })
}

fn read_limited(mut reader: impl Read) -> CommandResult<Vec<u8>> {
    let mut bytes = Vec::new();
    reader
        .by_ref()
        .take((MAX_GIT_OUTPUT + 1) as u64)
        .read_to_end(&mut bytes)
        .map_err(CommandError::io)?;
    if bytes.len() > MAX_GIT_OUTPUT {
        return Err(CommandError::new("GIT_FAILED", "Git output exceeded limit"));
    }
    Ok(bytes)
}

fn parse_status(value: &str) -> CommandResult<GitStatus> {
    let records: Vec<&str> = value
        .split('\0')
        .filter(|record| !record.is_empty())
        .collect();
    let mut branch = None;
    let mut upstream = None;
    let mut ahead = 0;
    let mut behind = 0;
    let mut changes = Vec::new();
    let mut index = 0;
    while index < records.len() {
        let record = records[index];
        if let Some(name) = record.strip_prefix("# branch.head ") {
            branch = (name != "(detached)").then(|| name.into());
        } else if let Some(name) = record.strip_prefix("# branch.upstream ") {
            upstream = Some(name.into());
        } else if let Some(ab) = record.strip_prefix("# branch.ab ") {
            for token in ab.split_whitespace() {
                if let Some(value) = token.strip_prefix('+') {
                    ahead = value.parse().unwrap_or(0);
                }
                if let Some(value) = token.strip_prefix('-') {
                    behind = value.parse().unwrap_or(0);
                }
            }
        } else if let Some(path) = record.strip_prefix("? ") {
            changes.push(GitChange {
                path: path.into(),
                original_path: None,
                staged: false,
                unstaged: false,
                untracked: true,
                status: "??".into(),
                additions: None,
                deletions: None,
            });
        } else if record.starts_with("1 ") || record.starts_with("u ") {
            let fields: Vec<&str> = record
                .splitn(if record.starts_with("1 ") { 9 } else { 11 }, ' ')
                .collect();
            let xy = fields
                .get(1)
                .ok_or_else(|| CommandError::new("GIT_FAILED", "malformed porcelain record"))?;
            let path = fields.last().unwrap_or(&"");
            changes.push(change(path, None, xy));
        } else if record.starts_with("2 ") {
            let fields: Vec<&str> = record.splitn(10, ' ').collect();
            let xy = fields
                .get(1)
                .ok_or_else(|| CommandError::new("GIT_FAILED", "malformed rename record"))?;
            let path = *fields.last().unwrap_or(&"");
            index += 1;
            let original = records.get(index).map(|value| (*value).to_owned());
            changes.push(change(path, original, xy));
        }
        index += 1;
    }
    let mut unique = BTreeMap::new();
    for change in changes {
        unique.insert(
            (
                change.path.clone(),
                change.staged,
                change.unstaged,
                change.untracked,
            ),
            change,
        );
    }
    Ok(GitStatus {
        branch,
        upstream,
        ahead,
        behind,
        changes: unique.into_values().collect(),
    })
}

fn apply_numstat(changes: &mut [GitChange], output: &str) {
    for record in output.split('\0').filter(|record| !record.is_empty()) {
        let mut fields = record.splitn(3, '\t');
        let additions = fields.next().and_then(|value| value.parse::<u64>().ok());
        let deletions = fields.next().and_then(|value| value.parse::<u64>().ok());
        let Some(path) = fields.next() else { continue };
        if let Some(change) = changes.iter_mut().find(|change| change.path == path) {
            change.additions = match (change.additions, additions) {
                (Some(current), Some(value)) => Some(current + value),
                (None, value) => value,
                (value, None) => value,
            };
            change.deletions = match (change.deletions, deletions) {
                (Some(current), Some(value)) => Some(current + value),
                (None, value) => value,
                (value, None) => value,
            };
        }
    }
}

fn change(path: &str, original_path: Option<String>, xy: &str) -> GitChange {
    let mut chars = xy.chars();
    let x = chars.next().unwrap_or('.');
    let y = chars.next().unwrap_or('.');
    GitChange {
        path: path.into(),
        original_path,
        staged: x != '.',
        unstaged: y != '.',
        untracked: false,
        status: xy.into(),
        additions: None,
        deletions: None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::{
        fs,
        path::PathBuf,
        time::{SystemTime, UNIX_EPOCH},
    };

    fn temp() -> PathBuf {
        std::env::temp_dir().join(format!(
            "pi-app-git-{}",
            SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ))
    }

    fn repository() -> (PathBuf, ProjectService, Uuid) {
        let root = temp();
        fs::create_dir_all(&root).unwrap();
        assert!(Command::new("git")
            .args(["init", "-q"])
            .current_dir(&root)
            .status()
            .unwrap()
            .success());
        assert!(Command::new("git")
            .args(["config", "user.email", "test@example.com"])
            .current_dir(&root)
            .status()
            .unwrap()
            .success());
        assert!(Command::new("git")
            .args(["config", "user.name", "Test"])
            .current_dir(&root)
            .status()
            .unwrap()
            .success());
        fs::write(root.join("tracked.txt"), "head\n").unwrap();
        assert!(Command::new("git")
            .args(["add", "."])
            .current_dir(&root)
            .status()
            .unwrap()
            .success());
        assert!(Command::new("git")
            .args(["commit", "-qm", "initial"])
            .current_dir(&root)
            .status()
            .unwrap()
            .success());
        let projects = ProjectService::load(root.join("app/state.json")).unwrap();
        let project_id = projects.open_path(&root).unwrap().id;
        (root, projects, project_id)
    }

    #[test]
    fn returns_real_sides_for_all_scopes_and_deleted_files() {
        let (root, projects, id) = repository();
        fs::write(root.join("tracked.txt"), "index\n").unwrap();
        assert!(Command::new("git")
            .args(["add", "tracked.txt"])
            .current_dir(&root)
            .status()
            .unwrap()
            .success());
        fs::write(root.join("tracked.txt"), "worktree\n").unwrap();
        let staged = diff_file(&projects, id, "tracked.txt", "staged").unwrap();
        assert_eq!(staged.original.as_deref(), Some("head\n"));
        assert_eq!(staged.modified.as_deref(), Some("index\n"));
        let unstaged = diff_file(&projects, id, "tracked.txt", "unstaged").unwrap();
        assert_eq!(unstaged.original.as_deref(), Some("index\n"));
        assert_eq!(unstaged.modified.as_deref(), Some("worktree\n"));

        fs::create_dir(root.join("new")).unwrap();
        fs::write(root.join("new/deep.txt"), "new\n").unwrap();
        let untracked = diff_file(&projects, id, "new/deep.txt", "untracked").unwrap();
        assert_eq!(untracked.original, None);
        assert_eq!(untracked.modified.as_deref(), Some("new\n"));

        fs::remove_file(root.join("tracked.txt")).unwrap();
        let deleted = diff_file(&projects, id, "tracked.txt", "unstaged").unwrap();
        assert_eq!(deleted.original.as_deref(), Some("index\n"));
        assert_eq!(deleted.modified, None);
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn parses_porcelain_v2_with_branch_rename_and_untracked() {
        let raw = concat!(
            "# branch.head main\0",
            "# branch.upstream origin/main\0",
            "# branch.ab +2 -1\0",
            "1 M. N... 100644 100644 100644 a b c file.txt\0",
            "2 R. N... 100644 100644 100644 a b c R100 new name\0",
            "old name\0",
            "? untracked.txt\0"
        );
        let status = parse_status(raw).unwrap();
        assert_eq!(status.branch.as_deref(), Some("main"));
        assert_eq!((status.ahead, status.behind), (2, 1));
        assert_eq!(status.changes.len(), 3);
        assert!(status
            .changes
            .iter()
            .any(|change| change.original_path.as_deref() == Some("old name")));
    }
}
