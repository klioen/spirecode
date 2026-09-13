use crate::{
    app_state::AppState,
    error::{CommandError, CommandResult},
    filesystem::{self, FileContent, FileEntry},
    git::{GitDiff, GitStatus},
    projects::ProjectSummary,
    terminal::{TerminalEvent, TerminalSummary},
};
use std::path::PathBuf;
use tauri::{ipc::Channel, AppHandle, Manager};
use tauri_plugin_clipboard_manager::ClipboardExt;
use tauri_plugin_dialog::DialogExt;
use tauri_plugin_opener::OpenerExt;
use uuid::Uuid;

async fn run_blocking<T, F>(operation: F) -> CommandResult<T>
where
    T: Send + 'static,
    F: FnOnce() -> CommandResult<T> + Send + 'static,
{
    tauri::async_runtime::spawn_blocking(operation)
        .await
        .map_err(|error| {
            CommandError::new(
                "INVALID_ARGUMENT",
                format!("background operation failed: {error}"),
            )
        })?
}

#[tauri::command]
pub fn project_list(app: AppHandle) -> CommandResult<Vec<ProjectSummary>> {
    app.state::<AppState>().projects.list()
}

#[tauri::command]
pub async fn project_open_path(path: String, app: AppHandle) -> CommandResult<ProjectSummary> {
    run_blocking(move || app.state::<AppState>().open_project(&PathBuf::from(path))).await
}

#[tauri::command]
pub async fn project_open_dialog(app: AppHandle) -> CommandResult<Option<ProjectSummary>> {
    let selected = app.dialog().file().blocking_pick_folder();
    let Some(path) = selected else {
        return Ok(None);
    };
    let path = path
        .into_path()
        .map_err(|error| CommandError::new("INVALID_ARGUMENT", error.to_string()))?;
    run_blocking(move || app.state::<AppState>().open_project(&path))
        .await
        .map(Some)
}

#[tauri::command]
pub async fn project_close(project_id: Uuid, app: AppHandle) -> CommandResult<ProjectSummary> {
    run_blocking(move || app.state::<AppState>().close_project(project_id)).await
}

#[tauri::command]
pub fn project_reveal(project_id: Uuid, app: AppHandle) -> CommandResult<()> {
    let root = app.state::<AppState>().projects.root(project_id)?;
    app.opener()
        .reveal_item_in_dir(root)
        .map_err(|error| CommandError::new("INVALID_ARGUMENT", error.to_string()))
}

#[tauri::command]
pub fn project_copy_path(project_id: Uuid, app: AppHandle) -> CommandResult<()> {
    let root = app.state::<AppState>().projects.root(project_id)?;
    app.clipboard()
        .write_text(root.to_string_lossy())
        .map_err(|error| CommandError::new("INVALID_ARGUMENT", error.to_string()))
}

#[tauri::command]
pub async fn fs_read_dir(
    project_id: Uuid,
    relative_path: String,
    app: AppHandle,
) -> CommandResult<Vec<FileEntry>> {
    run_blocking(move || {
        let state = app.state::<AppState>();
        filesystem::read_dir(&state.projects, project_id, &relative_path)
    })
    .await
}

#[tauri::command]
pub async fn fs_read_file(
    project_id: Uuid,
    relative_path: String,
    app: AppHandle,
) -> CommandResult<FileContent> {
    run_blocking(move || {
        let state = app.state::<AppState>();
        filesystem::read_file(&state.projects, project_id, &relative_path)
    })
    .await
}

#[tauri::command]
pub async fn git_status(project_id: Uuid, app: AppHandle) -> CommandResult<GitStatus> {
    run_blocking(move || {
        let state = app.state::<AppState>();
        state.git.status(&state.projects, project_id)
    })
    .await
}

#[tauri::command]
pub async fn git_diff_file(
    project_id: Uuid,
    relative_path: String,
    scope: String,
    app: AppHandle,
) -> CommandResult<GitDiff> {
    run_blocking(move || {
        let state = app.state::<AppState>();
        state
            .git
            .diff_file(&state.projects, project_id, &relative_path, &scope)
    })
    .await
}

#[tauri::command]
pub async fn terminal_create(
    project_id: Uuid,
    cols: u16,
    rows: u16,
    app: AppHandle,
) -> CommandResult<TerminalSummary> {
    run_blocking(move || {
        let state = app.state::<AppState>();
        let root = state.projects.root(project_id)?;
        state.terminals.create(project_id, &root, cols, rows)
    })
    .await
}

#[tauri::command]
pub fn terminal_attach(
    terminal_id: Uuid,
    on_event: Channel<TerminalEvent>,
    app: AppHandle,
) -> CommandResult<()> {
    app.state::<AppState>()
        .terminals
        .attach(terminal_id, on_event)
}

#[tauri::command]
pub async fn terminal_write(terminal_id: Uuid, data: String, app: AppHandle) -> CommandResult<()> {
    run_blocking(move || app.state::<AppState>().terminals.write(terminal_id, &data)).await
}

#[tauri::command]
pub fn terminal_resize(
    terminal_id: Uuid,
    cols: u16,
    rows: u16,
    app: AppHandle,
) -> CommandResult<()> {
    app.state::<AppState>()
        .terminals
        .resize(terminal_id, cols, rows)
}

#[tauri::command]
pub async fn terminal_close(terminal_id: Uuid, force: bool, app: AppHandle) -> CommandResult<()> {
    run_blocking(move || app.state::<AppState>().terminals.close(terminal_id, force)).await
}

#[tauri::command]
pub fn terminal_list(
    project_id: Option<Uuid>,
    app: AppHandle,
) -> CommandResult<Vec<TerminalSummary>> {
    app.state::<AppState>().terminals.list(project_id)
}

#[cfg(test)]
mod tests {
    use super::run_blocking;

    #[test]
    fn blocking_operations_run_off_the_calling_thread() {
        let caller = std::thread::current().id();
        let worker =
            tauri::async_runtime::block_on(run_blocking(|| Ok(std::thread::current().id())))
                .unwrap();
        assert_ne!(caller, worker);
    }
}
