use crate::{
    error::{CommandError, CommandResult},
    persistence,
};
use serde::{Deserialize, Serialize};
use std::{
    path::{Path, PathBuf},
    process::Command,
    sync::{Mutex, MutexGuard},
    time::{SystemTime, UNIX_EPOCH},
};
use uuid::Uuid;

const STATE_VERSION: u32 = 1;

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ProjectSummary {
    pub id: Uuid,
    pub name: String,
    pub path: String,
    pub last_opened_at: u64,
}

#[derive(Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct Catalog {
    version: u32,
    projects: Vec<ProjectSummary>,
    active_project_id: Option<Uuid>,
}

pub struct ProjectService {
    state_path: PathBuf,
    catalog: Mutex<Catalog>,
}

impl ProjectService {
    pub fn load(state_path: PathBuf) -> CommandResult<Self> {
        let catalog: Catalog = persistence::load_or_default(&state_path)?;
        if catalog.version != 0 && catalog.version != STATE_VERSION {
            return Err(CommandError::new(
                "INVALID_ARGUMENT",
                "unsupported state version",
            ));
        }
        Ok(Self {
            state_path,
            catalog: Mutex::new(catalog),
        })
    }

    pub fn list(&self) -> CommandResult<Vec<ProjectSummary>> {
        let mut projects = self.lock()?.projects.clone();
        projects.sort_by_key(|project| std::cmp::Reverse(project.last_opened_at));
        Ok(projects)
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
        let now = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map_err(|error| CommandError::new("INVALID_ARGUMENT", error.to_string()))?
            .as_secs();
        let mut catalog = self.lock()?;
        let project = if let Some(project) = catalog
            .projects
            .iter_mut()
            .find(|project| project.path == path)
        {
            project.last_opened_at = now;
            project.clone()
        } else {
            let project = ProjectSummary {
                id: Uuid::new_v4(),
                name,
                path,
                last_opened_at: now,
            };
            catalog.projects.push(project.clone());
            project
        };
        catalog.version = STATE_VERSION;
        catalog.active_project_id = Some(project.id);
        persistence::save_atomic(&self.state_path, &*catalog)?;
        Ok(project)
    }

    pub fn close(&self, id: Uuid) -> CommandResult<ProjectSummary> {
        let mut catalog = self.lock()?;
        let index = catalog
            .projects
            .iter()
            .position(|project| project.id == id)
            .ok_or_else(|| CommandError::new("NOT_FOUND", "project not found"))?;
        let project = catalog.projects.remove(index);
        if catalog.active_project_id == Some(id) {
            catalog.active_project_id = None;
        }
        persistence::save_atomic(&self.state_path, &*catalog)?;
        Ok(project)
    }

    pub fn root(&self, id: Uuid) -> CommandResult<PathBuf> {
        let catalog = self.lock()?;
        let project = catalog
            .projects
            .iter()
            .find(|project| project.id == id)
            .ok_or_else(|| CommandError::new("NOT_FOUND", "project not found"))?;
        PathBuf::from(&project.path)
            .canonicalize()
            .map_err(CommandError::io)
    }

    fn lock(&self) -> CommandResult<MutexGuard<'_, Catalog>> {
        self.catalog
            .lock()
            .map_err(|_| CommandError::new("INVALID_ARGUMENT", "project catalog lock poisoned"))
    }
}

fn git_root(path: &Path) -> CommandResult<PathBuf> {
    let output = Command::new("git")
        .args([
            "-c",
            "core.hooksPath=/dev/null",
            "-c",
            "credential.helper=",
            "-c",
            "protocol.ext.allow=never",
            "rev-parse",
            "--show-toplevel",
        ])
        .current_dir(path)
        .output()
        .map_err(CommandError::io)?;
    if !output.status.success() {
        return Err(CommandError::new(
            "NOT_A_GIT_REPOSITORY",
            String::from_utf8_lossy(&output.stderr).trim(),
        ));
    }
    let value = String::from_utf8(output.stdout)
        .map_err(|_| CommandError::new("NOT_A_GIT_REPOSITORY", "Git returned a non-UTF-8 root"))?;
    Ok(PathBuf::from(value.trim()))
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::{
        fs,
        time::{SystemTime, UNIX_EPOCH},
    };
    fn temp() -> PathBuf {
        std::env::temp_dir().join(format!(
            "pi-app-project-{}",
            SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ))
    }
    #[test]
    fn deduplicates_and_persists_projects() {
        let dir = temp();
        fs::create_dir_all(&dir).unwrap();
        assert!(Command::new("git")
            .args(["init", "-q"])
            .current_dir(&dir)
            .status()
            .unwrap()
            .success());
        let state = dir.join("app/state.json");
        let service = ProjectService::load(state.clone()).unwrap();
        let first = service.open_path(&dir).unwrap();
        let second = service.open_path(&dir).unwrap();
        assert_eq!(first.id, second.id);
        assert_eq!(service.list().unwrap().len(), 1);
        drop(service);
        assert_eq!(
            ProjectService::load(state).unwrap().list().unwrap().len(),
            1
        );
        fs::remove_dir_all(dir).unwrap();
    }
}
