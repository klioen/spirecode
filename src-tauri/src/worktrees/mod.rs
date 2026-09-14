use crate::{
    error::{CommandError, CommandResult},
    projects::{ProjectService, ProjectSummary, WorktreeKind, WorktreeSummary},
    terminal::TerminalRegistry,
};
use serde::{Deserialize, Serialize};
use std::{
    collections::HashMap,
    fs,
    path::{Path, PathBuf},
    process::{Command, Output},
    sync::{Arc, Mutex},
    time::{SystemTime, UNIX_EPOCH},
};
use uuid::Uuid;

const MARKER: &str = ".pi-worktree-owner.json";

#[derive(Clone, Debug, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct OriginBranch {
    pub r#ref: String,
    pub name: String,
}

#[derive(Clone, Debug, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct OriginBranches {
    pub branches: Vec<OriginBranch>,
    pub default_ref: Option<String>,
    pub next_name: String,
}

#[derive(Clone, Debug, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct DeleteInspection {
    pub dirty: bool,
    pub terminal_count: usize,
    pub branch: String,
}

#[derive(Clone, Debug, Serialize, PartialEq, Eq)]
pub struct DeleteResult {
    pub ok: bool,
}

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct OwnerMarker {
    project_id: Uuid,
    git_common_dir: String,
}

#[derive(Default)]
pub struct WorktreeService {
    locks: Mutex<HashMap<Uuid, Arc<Mutex<()>>>>,
    managed_home: Option<PathBuf>,
}

impl WorktreeService {
    #[cfg(test)]
    pub fn with_managed_home(managed_home: PathBuf) -> Self {
        Self {
            locks: Mutex::default(),
            managed_home: Some(managed_home),
        }
    }

    pub fn list_origin_branches(
        &self,
        projects: &ProjectService,
        project_id: Uuid,
    ) -> CommandResult<OriginBranches> {
        let project = projects.project(project_id)?;
        let branches = origin_branches(Path::new(&project.path))?;
        let default_ref = default_origin_ref(Path::new(&project.path), &branches)?;
        let next_name = self.next_name(&project)?;
        Ok(OriginBranches {
            branches,
            default_ref,
            next_name,
        })
    }

    pub fn create(
        &self,
        projects: &ProjectService,
        project_id: Uuid,
        name: String,
        base_ref: String,
    ) -> CommandResult<WorktreeSummary> {
        let lock = self.repository_lock(project_id)?;
        let _guard = lock.lock().map_err(|_| lock_error())?;
        let project = projects.project(project_id)?;
        validate_name(&name)?;
        ensure_unique(&project, &name)?;
        let branches = origin_branches(Path::new(&project.path))?;
        let selected = branches
            .iter()
            .find(|branch| branch.r#ref == base_ref)
            .ok_or_else(|| {
                CommandError::new("INVALID_ARGUMENT", "baseRef is not an origin branch")
            })?;
        let full_ref = format!("refs/remotes/{}", selected.r#ref);
        if !full_ref.starts_with("refs/remotes/origin/") {
            return Err(CommandError::new(
                "INVALID_ARGUMENT",
                "baseRef must be under origin",
            ));
        }
        let root = self.managed_root(&project)?;
        ensure_owner(&root, &project)?;
        let path = root.join(&name);
        if path.exists() {
            return Err(CommandError::new(
                "WORKTREE_CONFLICT",
                "managed worktree path already exists",
            ));
        }
        run_git(
            Path::new(&project.path),
            &[
                "worktree",
                "add",
                path_str(&path)?,
                "-b",
                &name,
                "--no-track",
                "--end-of-options",
                &full_ref,
            ],
        )?;
        let now = now()?;
        let worktree = WorktreeSummary {
            id: Uuid::new_v4(),
            project_id,
            name: name.clone(),
            path: path.to_string_lossy().into_owned(),
            branch: name.clone(),
            base_ref,
            kind: WorktreeKind::Managed,
            last_opened_at: now,
        };
        let next_sequence = advance_sequence(&project, &name);
        match projects.add_worktree(project_id, worktree.clone(), next_sequence) {
            Ok(value) => Ok(value),
            Err(error) => {
                let remove = run_git(
                    Path::new(&project.path),
                    &["worktree", "remove", "--force", path_str(&path)?],
                );
                let branch = run_git(Path::new(&project.path), &["branch", "-D", "--", &name]);
                Err(recovery_error(
                    error,
                    [("removeWorktree", remove), ("deleteBranch", branch)],
                ))
            }
        }
    }

    pub fn rollback_created(
        &self,
        projects: &ProjectService,
        terminals: &TerminalRegistry,
        worktree_id: Uuid,
    ) -> CommandResult<()> {
        let worktree = projects.worktree(worktree_id)?;
        let project = projects.project(worktree.project_id)?;
        self.delete(projects, terminals, worktree_id, true)?;
        run_git(
            Path::new(&project.path),
            &["branch", "-D", "--", &worktree.branch],
        )?;
        Ok(())
    }

    pub fn rename(
        &self,
        projects: &ProjectService,
        terminals: &TerminalRegistry,
        worktree_id: Uuid,
        name: String,
    ) -> CommandResult<WorktreeSummary> {
        let current = projects.worktree(worktree_id)?;
        managed_only(&current)?;
        let lock = self.repository_lock(current.project_id)?;
        let _guard = lock.lock().map_err(|_| lock_error())?;
        let current = projects.worktree(worktree_id)?;
        let project = projects.project(current.project_id)?;
        validate_name(&name)?;
        if name == current.name {
            return Ok(current);
        }
        if terminals.count_worktree(worktree_id)? > 0 {
            return Err(CommandError::new(
                "WORKTREE_BUSY",
                "worktree has running terminals",
            ));
        }
        ensure_owner(&self.managed_root(&project)?, &project)?;
        ensure_unique(&project, &name)?;
        let old_path = PathBuf::from(&current.path);
        let new_path = self.managed_root(&project)?.join(&name);
        run_git(&old_path, &["branch", "-m", "--", &name])?;
        if let Err(error) = run_git(
            Path::new(&project.path),
            &[
                "worktree",
                "move",
                path_str(&old_path)?,
                path_str(&new_path)?,
            ],
        ) {
            let rollback = run_git(&old_path, &["branch", "-m", "--", &current.branch]);
            return Err(recovery_error(error, [("branchRename", rollback)]));
        }
        let mut renamed = current.clone();
        renamed.name = name.clone();
        renamed.branch = name.clone();
        renamed.path = new_path.to_string_lossy().into_owned();
        match projects.update_worktree(renamed.clone()) {
            Ok(value) => Ok(value),
            Err(error) => {
                let move_back = run_git(
                    Path::new(&project.path),
                    &[
                        "worktree",
                        "move",
                        path_str(&new_path)?,
                        path_str(&old_path)?,
                    ],
                );
                let branch_back = run_git(
                    Path::new(&project.path),
                    &["branch", "-m", &name, &current.branch],
                );
                Err(recovery_error(
                    error,
                    [("moveBack", move_back), ("branchRenameBack", branch_back)],
                ))
            }
        }
    }

    pub fn inspect_delete(
        &self,
        projects: &ProjectService,
        terminals: &TerminalRegistry,
        worktree_id: Uuid,
    ) -> CommandResult<DeleteInspection> {
        let worktree = projects.worktree(worktree_id)?;
        managed_only(&worktree)?;
        let output = run_git(
            Path::new(&worktree.path),
            &["status", "--porcelain=v2", "-z", "--untracked-files=all"],
        )?;
        Ok(DeleteInspection {
            dirty: !output.stdout.is_empty(),
            terminal_count: terminals.count_worktree(worktree_id)?,
            branch: worktree.branch,
        })
    }

    pub fn delete(
        &self,
        projects: &ProjectService,
        terminals: &TerminalRegistry,
        worktree_id: Uuid,
        force: bool,
    ) -> CommandResult<DeleteResult> {
        let current = projects.worktree(worktree_id)?;
        managed_only(&current)?;
        let lock = self.repository_lock(current.project_id)?;
        let _guard = lock.lock().map_err(|_| lock_error())?;
        let current = projects.worktree(worktree_id)?;
        let project = projects.project(current.project_id)?;
        ensure_owner(&self.managed_root(&project)?, &project)?;
        let inspection = self.inspect_delete(projects, terminals, worktree_id)?;
        if !force && inspection.dirty {
            return Err(CommandError::new(
                "WORKTREE_DIRTY",
                "worktree has staged, unstaged, or untracked changes",
            ));
        }
        if !force && inspection.terminal_count > 0 {
            return Err(CommandError::new(
                "WORKTREE_BUSY",
                "worktree has running terminals",
            ));
        }
        if force {
            terminals.close_worktree(worktree_id)?;
        }
        let mut args = vec!["worktree", "remove"];
        if force {
            args.push("--force");
        }
        args.push(path_str(Path::new(&current.path))?);
        run_git(Path::new(&project.path), &args)?;
        projects.remove_worktree(worktree_id).map_err(|error| {
            error.detail(
                "recovery",
                "Git worktree was removed but catalog still contains its record; retry delete",
            )
        })?;
        Ok(DeleteResult { ok: true })
    }

    fn next_name(&self, project: &ProjectSummary) -> CommandResult<String> {
        let mut sequence = project.next_worktree_sequence.max(1);
        loop {
            let name = format!("worktree{sequence}");
            if is_available(project, &name, &self.managed_root(project)?)? {
                return Ok(name);
            }
            sequence += 1;
        }
    }

    fn managed_root(&self, project: &ProjectSummary) -> CommandResult<PathBuf> {
        let base = if let Some(path) = &self.managed_home {
            path.clone()
        } else {
            let home = std::env::var_os("HOME")
                .ok_or_else(|| CommandError::new("INVALID_ARGUMENT", "HOME is not set"))?;
            PathBuf::from(home).join(".pi/worktrees")
        };
        Ok(base.join(&project.name))
    }

    fn repository_lock(&self, project_id: Uuid) -> CommandResult<Arc<Mutex<()>>> {
        Ok(Arc::clone(
            self.locks
                .lock()
                .map_err(|_| lock_error())?
                .entry(project_id)
                .or_default(),
        ))
    }
}

fn validate_name(name: &str) -> CommandResult<()> {
    if name.trim() != name || name.is_empty() || name.len() > 48 {
        return Err(CommandError::new(
            "INVALID_WORKTREE_NAME",
            "name must be 1-48 characters without surrounding whitespace",
        ));
    }
    let bytes = name.as_bytes();
    if !bytes.first().is_some_and(u8::is_ascii_alphanumeric)
        || !bytes.last().is_some_and(u8::is_ascii_alphanumeric)
        || !bytes
            .iter()
            .all(|byte| byte.is_ascii_alphanumeric() || *byte == b'-' || *byte == b'_')
    {
        return Err(CommandError::new("INVALID_WORKTREE_NAME", "name may contain ASCII letters, digits, '-' and '_', and must start and end alphanumeric"));
    }
    Ok(())
}

fn origin_branches(root: &Path) -> CommandResult<Vec<OriginBranch>> {
    let output = run_git(
        root,
        &[
            "for-each-ref",
            "--format=%(refname)%00%(symref)",
            "refs/remotes/origin",
        ],
    )?;
    let mut branches = Vec::new();
    for line in String::from_utf8(output.stdout)
        .map_err(|_| CommandError::new("GIT_FAILED", "Git returned non-UTF-8 refs"))?
        .lines()
    {
        let mut fields = line.splitn(2, '\0');
        let full = fields.next().unwrap_or_default();
        let symbolic = fields.next().unwrap_or_default();
        if !symbolic.is_empty() || full == "refs/remotes/origin/HEAD" {
            continue;
        }
        if let Some(name) = full.strip_prefix("refs/remotes/origin/") {
            branches.push(OriginBranch {
                r#ref: format!("origin/{name}"),
                name: name.into(),
            });
        }
    }
    branches.sort_by(|a, b| a.name.cmp(&b.name));
    Ok(branches)
}

fn default_origin_ref(root: &Path, branches: &[OriginBranch]) -> CommandResult<Option<String>> {
    let head = run_git_allow_failure(
        root,
        &["symbolic-ref", "--quiet", "refs/remotes/origin/HEAD"],
    )?;
    if head.status.success() {
        let target = String::from_utf8_lossy(&head.stdout)
            .trim()
            .replace("refs/remotes/", "");
        if branches.iter().any(|branch| branch.r#ref == target) {
            return Ok(Some(target));
        }
    }
    Ok(branches
        .iter()
        .find(|branch| branch.r#ref == "origin/main")
        .or_else(|| branches.first())
        .map(|branch| branch.r#ref.clone()))
}

fn ensure_unique(project: &ProjectSummary, name: &str) -> CommandResult<()> {
    if project
        .worktrees
        .iter()
        .any(|worktree| worktree.name == name || worktree.branch == name)
    {
        return Err(CommandError::new(
            "WORKTREE_CONFLICT",
            "worktree name is already in the catalog",
        ));
    }
    let output = run_git_allow_failure(
        Path::new(&project.path),
        &[
            "show-ref",
            "--verify",
            "--quiet",
            &format!("refs/heads/{name}"),
        ],
    )?;
    if output.status.success() {
        return Err(CommandError::new(
            "WORKTREE_CONFLICT",
            "local branch already exists",
        ));
    }
    Ok(())
}

fn is_available(project: &ProjectSummary, name: &str, root: &Path) -> CommandResult<bool> {
    if project
        .worktrees
        .iter()
        .any(|worktree| worktree.name == name)
        || root.join(name).exists()
    {
        return Ok(false);
    }
    let output = run_git_allow_failure(
        Path::new(&project.path),
        &[
            "show-ref",
            "--verify",
            "--quiet",
            &format!("refs/heads/{name}"),
        ],
    )?;
    Ok(!output.status.success())
}

fn advance_sequence(project: &ProjectSummary, name: &str) -> u64 {
    let after_success = project.next_worktree_sequence.saturating_add(1);
    name.strip_prefix("worktree")
        .and_then(|value| value.parse::<u64>().ok())
        .map_or(after_success, |value| after_success.max(value + 1))
}

fn ensure_owner(root: &Path, project: &ProjectSummary) -> CommandResult<()> {
    if fs::symlink_metadata(root).is_ok_and(|metadata| metadata.file_type().is_symlink()) {
        return Err(CommandError::new(
            "WORKTREE_OWNER_CONFLICT",
            "managed project root must not be a symlink",
        ));
    }
    let common = git_common_dir(Path::new(&project.path))?;
    let expected = OwnerMarker {
        project_id: project.id,
        git_common_dir: common,
    };
    let marker = root.join(MARKER);
    if fs::symlink_metadata(&marker).is_ok_and(|metadata| metadata.file_type().is_symlink()) {
        return Err(CommandError::new(
            "WORKTREE_OWNER_CONFLICT",
            "managed root ownership marker must not be a symlink",
        ));
    }
    if marker.exists() {
        let existing: OwnerMarker = serde_json::from_slice(
            &fs::read(&marker).map_err(CommandError::io)?,
        )
        .map_err(|_| {
            CommandError::new(
                "WORKTREE_OWNER_CONFLICT",
                "managed root has an invalid ownership marker",
            )
        })?;
        if existing.project_id != expected.project_id
            || existing.git_common_dir != expected.git_common_dir
        {
            return Err(CommandError::new(
                "WORKTREE_OWNER_CONFLICT",
                "managed root belongs to another repository",
            ));
        }
        return Ok(());
    }
    if root.exists()
        && fs::read_dir(root)
            .map_err(CommandError::io)?
            .next()
            .is_some()
    {
        return Err(CommandError::new(
            "WORKTREE_OWNER_CONFLICT",
            "non-empty managed root has no ownership marker",
        ));
    }
    fs::create_dir_all(root).map_err(CommandError::io)?;
    fs::write(
        marker,
        serde_json::to_vec_pretty(&expected)
            .map_err(|error| CommandError::new("INVALID_ARGUMENT", error.to_string()))?,
    )
    .map_err(CommandError::io)
}

fn git_common_dir(root: &Path) -> CommandResult<String> {
    let output = run_git(
        root,
        &["rev-parse", "--path-format=absolute", "--git-common-dir"],
    )?;
    let path = PathBuf::from(String::from_utf8_lossy(&output.stdout).trim());
    Ok(path
        .canonicalize()
        .map_err(CommandError::io)?
        .to_string_lossy()
        .into_owned())
}

fn managed_only(worktree: &WorktreeSummary) -> CommandResult<()> {
    if worktree.kind == WorktreeKind::Managed {
        Ok(())
    } else {
        Err(CommandError::new(
            "MAIN_WORKTREE",
            "main worktree cannot be renamed or deleted",
        ))
    }
}

fn run_git(root: &Path, args: &[&str]) -> CommandResult<Output> {
    let output = run_git_allow_failure(root, args)?;
    if output.status.success() {
        Ok(output)
    } else {
        Err(
            CommandError::new("GIT_FAILED", String::from_utf8_lossy(&output.stderr).trim()).detail(
                "exitCode",
                output
                    .status
                    .code()
                    .map_or_else(|| "signal".into(), |code| code.to_string()),
            ),
        )
    }
}

fn run_git_allow_failure(root: &Path, args: &[&str]) -> CommandResult<Output> {
    Command::new("git")
        .current_dir(root)
        .args([
            "-c",
            "core.hooksPath=/dev/null",
            "-c",
            "credential.helper=",
            "-c",
            "protocol.ext.allow=never",
        ])
        .args(args)
        .output()
        .map_err(CommandError::io)
}

fn recovery_error<const N: usize>(
    error: CommandError,
    results: [(&str, CommandResult<Output>); N],
) -> CommandError {
    let failed: Vec<_> = results
        .into_iter()
        .filter_map(|(name, result)| result.err().map(|failure| format!("{name}: {failure}")))
        .collect();
    if failed.is_empty() {
        error
    } else {
        error.detail("recovery", failed.join("; "))
    }
}

fn path_str(path: &Path) -> CommandResult<&str> {
    path.to_str()
        .ok_or_else(|| CommandError::new("INVALID_ARGUMENT", "path is not valid UTF-8"))
}
fn now() -> CommandResult<u64> {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|value| value.as_secs())
        .map_err(|error| CommandError::new("INVALID_ARGUMENT", error.to_string()))
}
fn lock_error() -> CommandError {
    CommandError::new("GIT_FAILED", "repository mutation lock poisoned")
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::HashSet;

    struct Fixture {
        root: PathBuf,
        managed: PathBuf,
        projects: ProjectService,
        project: ProjectSummary,
        service: WorktreeService,
    }
    impl Fixture {
        fn new() -> Self {
            let root = std::env::temp_dir().join(format!("pi-worktrees-{}", Uuid::new_v4()));
            let origin = root.join("origin.git");
            let repo = root.join("repo");
            let managed = root.join("managed");
            fs::create_dir_all(&root).unwrap();
            git(&root, &["init", "--bare", origin.to_str().unwrap()]);
            git(
                &root,
                &["clone", origin.to_str().unwrap(), repo.to_str().unwrap()],
            );
            git(&repo, &["config", "user.email", "test@example.com"]);
            git(&repo, &["config", "user.name", "Test"]);
            fs::write(repo.join("tracked.txt"), "head\n").unwrap();
            git(&repo, &["add", "."]);
            git(&repo, &["commit", "-m", "initial"]);
            git(&repo, &["branch", "-M", "main"]);
            git(&repo, &["push", "-u", "origin", "main"]);
            git(&repo, &["branch", "release"]);
            git(&repo, &["push", "origin", "release"]);
            git(&origin, &["symbolic-ref", "HEAD", "refs/heads/main"]);
            git(&repo, &["remote", "set-head", "origin", "-a"]);
            let projects = ProjectService::load(root.join("state.json")).unwrap();
            let project = projects.open_path(&repo).unwrap();
            let service = WorktreeService::with_managed_home(managed.clone());
            Self {
                root,
                managed,
                projects,
                project,
                service,
            }
        }
    }
    impl Drop for Fixture {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.root);
        }
    }
    fn git(root: &Path, args: &[&str]) {
        let output = Command::new("git")
            .current_dir(root)
            .args(args)
            .output()
            .unwrap();
        assert!(
            output.status.success(),
            "git {:?}: {}",
            args,
            String::from_utf8_lossy(&output.stderr)
        );
    }

    #[test]
    fn validates_names_and_lists_origin_without_symbolic_head() {
        for invalid in ["", "-bad", "bad/part", " bad", "bad.", "é"] {
            assert_eq!(
                validate_name(invalid).unwrap_err().code,
                "INVALID_WORKTREE_NAME"
            );
        }
        let fixture = Fixture::new();
        let result = fixture
            .service
            .list_origin_branches(&fixture.projects, fixture.project.id)
            .unwrap();
        assert_eq!(result.default_ref.as_deref(), Some("origin/main"));
        assert_eq!(result.next_name, "worktree1");
        assert_eq!(
            result
                .branches
                .iter()
                .map(|branch| branch.name.as_str())
                .collect::<HashSet<_>>(),
            HashSet::from(["main", "release"])
        );
    }

    #[test]
    fn create_rename_delete_preserves_branch() {
        let fixture = Fixture::new();
        let terminals = TerminalRegistry::default();
        let created = fixture
            .service
            .create(
                &fixture.projects,
                fixture.project.id,
                "worktree1".into(),
                "origin/release".into(),
            )
            .unwrap();
        assert!(Path::new(&created.path).exists());
        let renamed = fixture
            .service
            .rename(
                &fixture.projects,
                &terminals,
                created.id,
                "release-fix".into(),
            )
            .unwrap();
        assert!(!Path::new(&created.path).exists());
        assert!(Path::new(&renamed.path).exists());
        assert!(
            !fixture
                .service
                .inspect_delete(&fixture.projects, &terminals, created.id)
                .unwrap()
                .dirty
        );
        fixture
            .service
            .delete(&fixture.projects, &terminals, created.id, false)
            .unwrap();
        assert!(!Path::new(&renamed.path).exists());
        let branch = run_git(
            Path::new(&fixture.project.path),
            &["show-ref", "--verify", "refs/heads/release-fix"],
        )
        .unwrap();
        assert!(branch.status.success());
    }

    #[test]
    fn dirty_staged_unstaged_and_untracked_require_force() {
        for mode in ["staged", "unstaged", "untracked"] {
            let fixture = Fixture::new();
            let terminals = TerminalRegistry::default();
            let created = fixture
                .service
                .create(
                    &fixture.projects,
                    fixture.project.id,
                    "worktree1".into(),
                    "origin/main".into(),
                )
                .unwrap();
            match mode {
                "staged" => {
                    fs::write(Path::new(&created.path).join("staged.txt"), "x").unwrap();
                    git(Path::new(&created.path), &["add", "staged.txt"]);
                }
                "unstaged" => {
                    fs::write(Path::new(&created.path).join("tracked.txt"), "changed").unwrap()
                }
                _ => fs::write(Path::new(&created.path).join("untracked.txt"), "x").unwrap(),
            }
            assert!(
                fixture
                    .service
                    .inspect_delete(&fixture.projects, &terminals, created.id)
                    .unwrap()
                    .dirty
            );
            assert_eq!(
                fixture
                    .service
                    .delete(&fixture.projects, &terminals, created.id, false)
                    .unwrap_err()
                    .code,
                "WORKTREE_DIRTY"
            );
            assert!(Path::new(&created.path).exists());
            assert!(fixture.projects.worktree(created.id).is_ok());
            fixture
                .service
                .delete(&fixture.projects, &terminals, created.id, true)
                .unwrap();
        }
    }

    #[test]
    fn busy_worktree_rejects_rename_and_delete_until_forced() {
        let fixture = Fixture::new();
        let terminals = TerminalRegistry::default();
        let created = fixture
            .service
            .create(
                &fixture.projects,
                fixture.project.id,
                "worktree1".into(),
                "origin/main".into(),
            )
            .unwrap();
        terminals
            .create(created.id, Path::new(&created.path), 80, 24)
            .unwrap();
        assert_eq!(
            fixture
                .service
                .rename(&fixture.projects, &terminals, created.id, "renamed".into())
                .unwrap_err()
                .code,
            "WORKTREE_BUSY"
        );
        assert_eq!(
            fixture
                .service
                .delete(&fixture.projects, &terminals, created.id, false)
                .unwrap_err()
                .code,
            "WORKTREE_BUSY"
        );
        fixture
            .service
            .delete(&fixture.projects, &terminals, created.id, true)
            .unwrap();
        assert_eq!(terminals.count_worktree(created.id).unwrap(), 0);
    }

    #[cfg(unix)]
    #[test]
    fn owner_marker_rejects_symlinked_managed_root() {
        use std::os::unix::fs::symlink;

        let fixture = Fixture::new();
        let project_root = fixture.managed.join(&fixture.project.name);
        fs::create_dir_all(project_root.parent().unwrap()).unwrap();
        symlink(std::env::temp_dir(), &project_root).unwrap();

        assert_eq!(
            fixture
                .service
                .create(
                    &fixture.projects,
                    fixture.project.id,
                    "worktree1".into(),
                    "origin/main".into(),
                )
                .unwrap_err()
                .code,
            "WORKTREE_OWNER_CONFLICT"
        );
    }

    #[test]
    fn owner_marker_rejects_different_repository() {
        let first = Fixture::new();
        first
            .service
            .create(
                &first.projects,
                first.project.id,
                "worktree1".into(),
                "origin/main".into(),
            )
            .unwrap();
        let second = Fixture::new();
        fs::create_dir_all(second.managed.join(&second.project.name)).unwrap();
        fs::copy(
            first.managed.join(&first.project.name).join(MARKER),
            second.managed.join(&second.project.name).join(MARKER),
        )
        .unwrap();
        assert_eq!(
            second
                .service
                .create(
                    &second.projects,
                    second.project.id,
                    "worktree1".into(),
                    "origin/main".into()
                )
                .unwrap_err()
                .code,
            "WORKTREE_OWNER_CONFLICT"
        );
    }
}
