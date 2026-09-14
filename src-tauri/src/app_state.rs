use crate::{
    error::{CommandError, CommandResult},
    filesystem::watcher::{EventSink, WatcherRegistry},
    git::GitService,
    projects::{ProjectService, ProjectSummary, WorktreeSummary},
    terminal::TerminalRegistry,
    worktrees::{DeleteResult, WorktreeService},
};
use std::{
    path::{Path, PathBuf},
    process::Command,
    sync::Arc,
};
use uuid::Uuid;

pub struct AppState {
    pub projects: ProjectService,
    pub terminals: TerminalRegistry,
    pub git: GitService,
    pub worktrees: WorktreeService,
    watchers: WatcherRegistry,
    event_sink: EventSink,
}
impl AppState {
    pub fn new(app_data_dir: PathBuf, event_sink: EventSink) -> CommandResult<Self> {
        let state = Self {
            projects: ProjectService::load(app_data_dir.join("state.json"))?,
            terminals: TerminalRegistry::default(),
            git: GitService::default(),
            worktrees: WorktreeService::default(),
            watchers: WatcherRegistry::default(),
            event_sink,
        };
        for project in state.projects.list()? {
            for worktree in project.worktrees {
                if Path::new(&worktree.path).exists() {
                    state.ensure_watcher(worktree.id, Path::new(&worktree.path))?;
                }
            }
        }
        Ok(state)
    }

    pub fn open_project(&self, path: &Path) -> CommandResult<ProjectSummary> {
        let project = self.projects.open_path(path)?;
        for worktree in &project.worktrees {
            self.ensure_watcher(worktree.id, Path::new(&worktree.path))?;
        }
        Ok(project)
    }

    pub fn close_project(&self, project_id: Uuid) -> CommandResult<ProjectSummary> {
        let project = self.projects.project(project_id)?;
        for worktree in &project.worktrees {
            self.watchers.close(worktree.id)?;
            self.terminals.close_worktree(worktree.id)?;
            self.git.close_project(worktree.id);
        }
        self.projects.close(project_id)
    }

    pub fn add_project_origin(
        &self,
        project_id: Uuid,
        url: String,
    ) -> CommandResult<crate::worktrees::OriginBranches> {
        self.worktrees.add_origin(&self.projects, project_id, url)
    }

    pub fn create_worktree(
        &self,
        project_id: Uuid,
        name: String,
        base_ref: String,
    ) -> CommandResult<WorktreeSummary> {
        let worktree = self
            .worktrees
            .create(&self.projects, project_id, name, base_ref)?;
        if let Err(error) = self.ensure_watcher(worktree.id, Path::new(&worktree.path)) {
            let rollback =
                self.worktrees
                    .rollback_created(&self.projects, &self.terminals, worktree.id);
            return Err(match rollback {
                Ok(_) => error,
                Err(rollback) => error.detail("recovery", rollback.to_string()),
            });
        }
        Ok(worktree)
    }

    pub fn rename_worktree(
        &self,
        worktree_id: Uuid,
        name: String,
    ) -> CommandResult<WorktreeSummary> {
        let original = self.projects.worktree(worktree_id)?;
        self.watchers.close(worktree_id)?;
        match self
            .worktrees
            .rename(&self.projects, &self.terminals, worktree_id, name)
        {
            Ok(worktree) => match self.ensure_watcher(worktree.id, Path::new(&worktree.path)) {
                Ok(()) => Ok(worktree),
                Err(error) => {
                    let rollback = self.worktrees.rename(
                        &self.projects,
                        &self.terminals,
                        worktree_id,
                        original.name,
                    );
                    if let Ok(restored) = &rollback {
                        let _ = self.ensure_watcher(restored.id, Path::new(&restored.path));
                    }
                    Err(match rollback {
                        Ok(_) => error,
                        Err(rollback) => error.detail("recovery", rollback.to_string()),
                    })
                }
            },
            Err(error) => {
                if let Ok(worktree) = self.projects.worktree(worktree_id) {
                    let _ = self.ensure_watcher(worktree.id, Path::new(&worktree.path));
                }
                Err(error)
            }
        }
    }

    pub fn delete_worktree(&self, worktree_id: Uuid, force: bool) -> CommandResult<DeleteResult> {
        let inspection =
            self.worktrees
                .inspect_delete(&self.projects, &self.terminals, worktree_id)?;
        if !force && (inspection.dirty || inspection.terminal_count > 0) {
            return self
                .worktrees
                .delete(&self.projects, &self.terminals, worktree_id, false);
        }
        self.watchers.close(worktree_id)?;
        self.git.close_project(worktree_id);
        match self
            .worktrees
            .delete(&self.projects, &self.terminals, worktree_id, force)
        {
            Ok(result) => Ok(result),
            Err(error) => {
                if let Ok(worktree) = self.projects.worktree(worktree_id) {
                    let _ = self.ensure_watcher(worktree.id, Path::new(&worktree.path));
                }
                Err(error)
            }
        }
    }

    fn ensure_watcher(&self, worktree_id: Uuid, root: &Path) -> CommandResult<()> {
        let output = Command::new("git")
            .args(["rev-parse", "--path-format=absolute", "--git-dir"])
            .current_dir(root)
            .output()
            .map_err(CommandError::io)?;
        if !output.status.success() {
            return Err(CommandError::new(
                "GIT_FAILED",
                String::from_utf8_lossy(&output.stderr).trim(),
            ));
        }
        let git_dir = PathBuf::from(String::from_utf8_lossy(&output.stdout).trim());
        self.watchers.ensure(
            worktree_id,
            root.to_path_buf(),
            git_dir,
            Arc::clone(&self.event_sink),
        )
    }
}
