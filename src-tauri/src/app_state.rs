use crate::{
    error::CommandResult,
    filesystem::watcher::{EventSink, WatcherRegistry},
    git::GitService,
    projects::{ProjectService, ProjectSummary},
    terminal::TerminalRegistry,
};
use std::{
    path::{Path, PathBuf},
    sync::Arc,
};
use uuid::Uuid;

pub struct AppState {
    pub projects: ProjectService,
    pub terminals: TerminalRegistry,
    pub git: GitService,
    watchers: WatcherRegistry,
    event_sink: EventSink,
}
impl AppState {
    pub fn new(app_data_dir: PathBuf, event_sink: EventSink) -> CommandResult<Self> {
        let state = Self {
            projects: ProjectService::load(app_data_dir.join("state.json"))?,
            terminals: TerminalRegistry::default(),
            git: GitService::default(),
            watchers: WatcherRegistry::default(),
            event_sink,
        };
        for project in state.projects.list()? {
            state.ensure_watcher(project.id, Path::new(&project.path))?;
        }
        Ok(state)
    }

    pub fn open_project(&self, path: &Path) -> CommandResult<ProjectSummary> {
        let project = self.projects.open_path(path)?;
        self.ensure_watcher(project.id, Path::new(&project.path))?;
        Ok(project)
    }

    pub fn close_project(&self, project_id: Uuid) -> CommandResult<ProjectSummary> {
        self.watchers.close(project_id)?;
        self.terminals.close_project(project_id);
        self.git.close_project(project_id);
        self.projects.close(project_id)
    }

    fn ensure_watcher(&self, project_id: Uuid, root: &Path) -> CommandResult<()> {
        self.watchers
            .ensure(project_id, root.to_path_buf(), Arc::clone(&self.event_sink))
    }
}
