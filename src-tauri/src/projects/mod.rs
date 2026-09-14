use crate::{
    error::{CommandError, CommandResult},
    persistence,
};
use serde::{Deserialize, Serialize};
use std::{
    collections::HashMap,
    fs,
    path::{Path, PathBuf},
    process::Command,
    sync::{Mutex, MutexGuard},
    time::{SystemTime, UNIX_EPOCH},
};
use uuid::Uuid;

const STATE_VERSION: u32 = 2;

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum WorktreeKind {
    Main,
    Managed,
    External,
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct WorktreeSummary {
    pub id: Uuid,
    pub project_id: Uuid,
    pub name: String,
    pub path: String,
    pub branch: String,
    pub base_ref: String,
    pub kind: WorktreeKind,
    pub last_opened_at: u64,
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ProjectSummary {
    pub id: Uuid,
    pub name: String,
    pub path: String,
    pub last_opened_at: u64,
    pub worktrees: Vec<WorktreeSummary>,
    pub next_worktree_sequence: u64,
}

#[derive(Clone, Debug, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ProjectCatalog {
    pub version: u32,
    pub projects: Vec<ProjectSummary>,
    pub active_worktree_id: Option<Uuid>,
}

#[derive(Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct Catalog {
    version: u32,
    projects: Vec<ProjectSummary>,
    active_worktree_id: Option<Uuid>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct CatalogV1 {
    #[allow(dead_code)]
    version: u32,
    projects: Vec<ProjectV1>,
    active_project_id: Option<Uuid>,
}

#[derive(Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ProjectV1 {
    id: Uuid,
    name: String,
    path: String,
    last_opened_at: u64,
}

pub struct ProjectService {
    state_path: PathBuf,
    catalog: Mutex<Catalog>,
}

impl ProjectService {
    pub fn load(state_path: PathBuf) -> CommandResult<Self> {
        let (catalog, migrated) = load_catalog(&state_path)?;
        let service = Self {
            state_path,
            catalog: Mutex::new(catalog),
        };
        if migrated {
            let catalog = service.lock()?;
            persistence::save_atomic(&service.state_path, &*catalog)?;
        }
        Ok(service)
    }

    pub fn catalog(&self) -> CommandResult<ProjectCatalog> {
        let catalog = self.lock()?;
        let mut projects = catalog.projects.clone();
        projects.sort_by_key(|project| std::cmp::Reverse(project.last_opened_at));
        Ok(ProjectCatalog {
            version: STATE_VERSION,
            projects,
            active_worktree_id: catalog.active_worktree_id,
        })
    }

    pub fn list(&self) -> CommandResult<Vec<ProjectSummary>> {
        Ok(self.catalog()?.projects)
    }

    pub fn open_path(&self, selected: &Path) -> CommandResult<ProjectSummary> {
        let root = git_root(selected)?;
        self.open_root(root)
    }

    fn open_root(&self, root: PathBuf) -> CommandResult<ProjectSummary> {
        let canonical = root.canonicalize().map_err(CommandError::io)?;
        let path = canonical.to_string_lossy().into_owned();
        let name = canonical
            .file_name()
            .map(|value| value.to_string_lossy().into_owned())
            .unwrap_or_else(|| path.clone());
        let now = now()?;
        self.transact(|catalog| {
            if let Some(project) = catalog
                .projects
                .iter_mut()
                .find(|project| project.path == path)
            {
                project.last_opened_at = now;
                let main = project
                    .worktrees
                    .iter_mut()
                    .find(|worktree| worktree.kind == WorktreeKind::Main)
                    .ok_or_else(|| {
                        CommandError::new("INVALID_ARGUMENT", "project has no main worktree")
                    })?;
                main.last_opened_at = now;
                catalog.active_worktree_id = Some(main.id);
                return Ok(project.clone());
            }
            let project_id = Uuid::new_v4();
            let worktree_id = Uuid::new_v4();
            let branch = current_branch(&canonical).unwrap_or_else(|| "HEAD".into());
            let main = WorktreeSummary {
                id: worktree_id,
                project_id,
                name: branch.clone(),
                path: path.clone(),
                branch: branch.clone(),
                base_ref: branch,
                kind: WorktreeKind::Main,
                last_opened_at: now,
            };
            let project = ProjectSummary {
                id: project_id,
                name,
                path,
                last_opened_at: now,
                worktrees: vec![main],
                next_worktree_sequence: 1,
            };
            catalog.projects.push(project.clone());
            catalog.active_worktree_id = Some(worktree_id);
            Ok(project)
        })
    }

    pub fn close(&self, id: Uuid) -> CommandResult<ProjectSummary> {
        self.transact(|catalog| {
            let index = catalog
                .projects
                .iter()
                .position(|project| project.id == id)
                .ok_or_else(|| CommandError::new("NOT_FOUND", "project not found"))?;
            let project = catalog.projects.remove(index);
            if catalog.active_worktree_id.is_some_and(|active| {
                project
                    .worktrees
                    .iter()
                    .any(|worktree| worktree.id == active)
            }) {
                catalog.active_worktree_id = None;
            }
            Ok(project)
        })
    }

    pub fn root(&self, worktree_id: Uuid) -> CommandResult<PathBuf> {
        let worktree = self.worktree(worktree_id)?;
        PathBuf::from(worktree.path)
            .canonicalize()
            .map_err(CommandError::io)
    }

    pub fn project(&self, id: Uuid) -> CommandResult<ProjectSummary> {
        self.lock()?
            .projects
            .iter()
            .find(|project| project.id == id)
            .cloned()
            .ok_or_else(|| CommandError::new("NOT_FOUND", "project not found"))
    }

    pub fn worktree(&self, id: Uuid) -> CommandResult<WorktreeSummary> {
        self.lock()?
            .projects
            .iter()
            .flat_map(|project| &project.worktrees)
            .find(|worktree| worktree.id == id)
            .cloned()
            .ok_or_else(|| CommandError::new("NOT_FOUND", "worktree not found"))
    }

    pub fn worktrees(&self, project_id: Uuid) -> CommandResult<Vec<WorktreeSummary>> {
        Ok(self.project(project_id)?.worktrees)
    }

    pub fn select(&self, worktree_id: Uuid) -> CommandResult<WorktreeSummary> {
        let now = now()?;
        self.transact(|catalog| {
            let worktree = catalog
                .projects
                .iter_mut()
                .flat_map(|project| &mut project.worktrees)
                .find(|worktree| worktree.id == worktree_id)
                .ok_or_else(|| CommandError::new("NOT_FOUND", "worktree not found"))?;
            worktree.last_opened_at = now;
            let result = worktree.clone();
            catalog.active_worktree_id = Some(worktree_id);
            Ok(result)
        })
    }

    pub(crate) fn add_worktree(
        &self,
        project_id: Uuid,
        worktree: WorktreeSummary,
        next_sequence: u64,
    ) -> CommandResult<WorktreeSummary> {
        self.transact(|catalog| {
            let project = catalog
                .projects
                .iter_mut()
                .find(|project| project.id == project_id)
                .ok_or_else(|| CommandError::new("NOT_FOUND", "project not found"))?;
            project.worktrees.push(worktree.clone());
            project.next_worktree_sequence = next_sequence;
            catalog.active_worktree_id = Some(worktree.id);
            Ok(worktree)
        })
    }

    pub(crate) fn update_worktree(&self, value: WorktreeSummary) -> CommandResult<WorktreeSummary> {
        self.transact(|catalog| {
            let worktree = catalog
                .projects
                .iter_mut()
                .flat_map(|project| &mut project.worktrees)
                .find(|worktree| worktree.id == value.id)
                .ok_or_else(|| CommandError::new("NOT_FOUND", "worktree not found"))?;
            *worktree = value.clone();
            Ok(value)
        })
    }

    pub(crate) fn remove_worktree(&self, id: Uuid) -> CommandResult<WorktreeSummary> {
        self.transact(|catalog| {
            let project = catalog
                .projects
                .iter_mut()
                .find(|project| project.worktrees.iter().any(|worktree| worktree.id == id))
                .ok_or_else(|| CommandError::new("NOT_FOUND", "worktree not found"))?;
            let index = project
                .worktrees
                .iter()
                .position(|worktree| worktree.id == id)
                .unwrap();
            let removed = project.worktrees.remove(index);
            if catalog.active_worktree_id == Some(id) {
                catalog.active_worktree_id = project
                    .worktrees
                    .iter()
                    .find(|worktree| worktree.kind == WorktreeKind::Main)
                    .map(|worktree| worktree.id);
            }
            Ok(removed)
        })
    }

    fn transact<T>(
        &self,
        operation: impl FnOnce(&mut Catalog) -> CommandResult<T>,
    ) -> CommandResult<T> {
        let mut current = self.lock()?;
        let mut candidate = current.clone();
        candidate.version = STATE_VERSION;
        let result = operation(&mut candidate)?;
        persistence::save_atomic(&self.state_path, &candidate)?;
        *current = candidate;
        Ok(result)
    }

    fn lock(&self) -> CommandResult<MutexGuard<'_, Catalog>> {
        self.catalog
            .lock()
            .map_err(|_| CommandError::new("INVALID_ARGUMENT", "project catalog lock poisoned"))
    }
}

fn load_catalog(path: &Path) -> CommandResult<(Catalog, bool)> {
    let bytes = match fs::read(path) {
        Ok(bytes) => bytes,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
            return Ok((Catalog::default(), false))
        }
        Err(error) => return Err(CommandError::io(error)),
    };
    let value: serde_json::Value = match serde_json::from_slice(&bytes) {
        Ok(value) => value,
        Err(error) => {
            let backup = path.with_extension("corrupt.json");
            fs::rename(path, &backup).map_err(CommandError::io)?;
            eprintln!(
                "warning: durable state was corrupt ({error}); backed up to {} and reset",
                backup.display()
            );
            return Ok((Catalog::default(), false));
        }
    };
    let version = value
        .get("version")
        .and_then(|value| value.as_u64())
        .unwrap_or(0);
    match version {
        0 | 2 => serde_json::from_value(value)
            .map(|catalog| (catalog, false))
            .map_err(|error| CommandError::new("INVALID_ARGUMENT", error.to_string())),
        1 => {
            let old: CatalogV1 = serde_json::from_value(value)
                .map_err(|error| CommandError::new("INVALID_ARGUMENT", error.to_string()))?;
            migrate_v1(old).map(|catalog| (catalog, true))
        }
        _ => Err(CommandError::new(
            "INVALID_ARGUMENT",
            "unsupported state version",
        )),
    }
}

fn migrate_v1(old: CatalogV1) -> CommandResult<Catalog> {
    let mut groups: HashMap<String, Vec<ProjectV1>> = HashMap::new();
    for project in old.projects {
        let common = git_absolute(
            &PathBuf::from(&project.path),
            &["rev-parse", "--path-format=absolute", "--git-common-dir"],
        )
        .unwrap_or_else(|_| project.path.clone());
        let key = fs::canonicalize(common.trim())
            .unwrap_or_else(|_| PathBuf::from(common.trim()))
            .to_string_lossy()
            .into_owned();
        groups.entry(key).or_default().push(project);
    }
    let mut projects = Vec::new();
    let mut active_worktree_id = old.active_project_id;
    for (_, mut checkouts) in groups {
        checkouts.sort_by_key(|project| std::cmp::Reverse(project.last_opened_at));
        let main_index = checkouts
            .iter()
            .position(|project| {
                let root = PathBuf::from(&project.path);
                let git_dir =
                    git_absolute(&root, &["rev-parse", "--path-format=absolute", "--git-dir"]);
                let common = git_absolute(
                    &root,
                    &["rev-parse", "--path-format=absolute", "--git-common-dir"],
                );
                git_dir.ok().zip(common.ok()).is_some_and(|(a, b)| {
                    fs::canonicalize(a.trim()).ok() == fs::canonicalize(b.trim()).ok()
                })
            })
            .unwrap_or(0);
        let main = checkouts[main_index].clone();
        let project_id = Uuid::new_v4();
        let mut worktrees = Vec::new();
        for (index, checkout) in checkouts.into_iter().enumerate() {
            let branch = current_branch(Path::new(&checkout.path)).unwrap_or_else(|| "HEAD".into());
            worktrees.push(WorktreeSummary {
                id: checkout.id,
                project_id,
                name: if index == main_index {
                    branch.clone()
                } else {
                    checkout.name
                },
                path: checkout.path,
                branch: branch.clone(),
                base_ref: branch,
                kind: if index == main_index {
                    WorktreeKind::Main
                } else {
                    WorktreeKind::External
                },
                last_opened_at: checkout.last_opened_at,
            });
        }
        if active_worktree_id.is_none() {
            active_worktree_id = worktrees
                .iter()
                .find(|worktree| worktree.kind == WorktreeKind::Main)
                .map(|worktree| worktree.id);
        }
        projects.push(ProjectSummary {
            id: project_id,
            name: main.name,
            path: main.path,
            last_opened_at: main.last_opened_at,
            worktrees,
            next_worktree_sequence: 1,
        });
    }
    Ok(Catalog {
        version: STATE_VERSION,
        projects,
        active_worktree_id,
    })
}

fn now() -> CommandResult<u64> {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|value| value.as_secs())
        .map_err(|error| CommandError::new("INVALID_ARGUMENT", error.to_string()))
}

fn current_branch(root: &Path) -> Option<String> {
    git_absolute(root, &["symbolic-ref", "--quiet", "--short", "HEAD"])
        .ok()
        .map(|value| value.trim().to_owned())
        .filter(|value| !value.is_empty())
}

fn git_absolute(root: &Path, args: &[&str]) -> CommandResult<String> {
    let output = Command::new("git")
        .args(["-c", "core.hooksPath=/dev/null"])
        .args(args)
        .current_dir(root)
        .output()
        .map_err(CommandError::io)?;
    if !output.status.success() {
        return Err(CommandError::new(
            "GIT_FAILED",
            String::from_utf8_lossy(&output.stderr).trim(),
        ));
    }
    String::from_utf8(output.stdout)
        .map_err(|_| CommandError::new("GIT_FAILED", "Git returned non-UTF-8 output"))
}

fn git_root(path: &Path) -> CommandResult<PathBuf> {
    git_absolute(path, &["rev-parse", "--show-toplevel"]).map(|value| PathBuf::from(value.trim()))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp() -> PathBuf {
        std::env::temp_dir().join(format!("spirecode-project-{}", Uuid::new_v4()))
    }

    fn init(root: &Path) {
        fs::create_dir_all(root).unwrap();
        assert!(Command::new("git")
            .args(["init", "-q"])
            .current_dir(root)
            .status()
            .unwrap()
            .success());
    }

    #[test]
    fn opens_v2_project_with_distinct_repository_and_main_ids() {
        let dir = temp();
        init(&dir);
        let state = dir.join("app/state.json");
        let service = ProjectService::load(state.clone()).unwrap();
        let first = service.open_path(&dir).unwrap();
        let second = service.open_path(&dir).unwrap();
        assert_eq!(first.id, second.id);
        assert_ne!(first.id, first.worktrees[0].id);
        assert_eq!(
            service.root(first.worktrees[0].id).unwrap(),
            dir.canonicalize().unwrap()
        );
        drop(service);
        assert_eq!(
            ProjectService::load(state).unwrap().list().unwrap().len(),
            1
        );
        fs::remove_dir_all(dir).unwrap();
    }

    #[test]
    fn migrates_v1_without_corrupt_backup_and_preserves_checkout_id() {
        let dir = temp();
        init(&dir);
        let state = dir.join("app/state.json");
        fs::create_dir_all(state.parent().unwrap()).unwrap();
        let old_id = Uuid::new_v4();
        fs::write(
            &state,
            serde_json::json!({
                "version": 1,
                "projects": [{"id": old_id, "name": "repo", "path": dir, "lastOpenedAt": 7}],
                "activeProjectId": old_id
            })
            .to_string(),
        )
        .unwrap();
        let service = ProjectService::load(state.clone()).unwrap();
        let catalog = service.catalog().unwrap();
        assert_eq!(catalog.version, 2);
        assert_eq!(catalog.projects[0].worktrees[0].id, old_id);
        assert_eq!(catalog.active_worktree_id, Some(old_id));
        assert!(!state.with_extension("corrupt.json").exists());
        fs::remove_dir_all(dir).unwrap();
    }

    #[test]
    fn migrates_existing_linked_checkout_as_external() {
        let dir = temp();
        init(&dir);
        fs::write(dir.join("tracked.txt"), "initial\n").unwrap();
        assert!(Command::new("git")
            .args(["add", "tracked.txt"])
            .current_dir(&dir)
            .status()
            .unwrap()
            .success());
        assert!(Command::new("git")
            .args([
                "-c",
                "user.name=SpireCode",
                "-c",
                "user.email=pi@example.invalid",
                "commit",
                "-qm",
                "initial",
            ])
            .current_dir(&dir)
            .status()
            .unwrap()
            .success());
        let linked = dir.with_extension("linked");
        assert!(Command::new("git")
            .args(["worktree", "add", "-qb", "linked", linked.to_str().unwrap(),])
            .current_dir(&dir)
            .status()
            .unwrap()
            .success());
        let state = dir.join("app/state.json");
        fs::create_dir_all(state.parent().unwrap()).unwrap();
        let main_id = Uuid::new_v4();
        let linked_id = Uuid::new_v4();
        fs::write(
            &state,
            serde_json::json!({
                "version": 1,
                "projects": [
                    {"id": main_id, "name": "repo", "path": dir, "lastOpenedAt": 7},
                    {"id": linked_id, "name": "linked", "path": linked, "lastOpenedAt": 6}
                ],
                "activeProjectId": linked_id
            })
            .to_string(),
        )
        .unwrap();

        let catalog = ProjectService::load(state).unwrap().catalog().unwrap();
        let external = catalog.projects[0]
            .worktrees
            .iter()
            .find(|worktree| worktree.id == linked_id)
            .unwrap();
        assert_eq!(external.kind, WorktreeKind::External);
        assert_eq!(catalog.active_worktree_id, Some(linked_id));
        fs::remove_dir_all(dir.parent().unwrap().join(dir.file_name().unwrap())).unwrap();
        fs::remove_dir_all(linked).unwrap();
    }
}
