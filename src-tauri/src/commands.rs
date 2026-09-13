use crate::{
    app_state::AppState,
    error::{CommandError, CommandResult},
    filesystem::{self, FileContent, FileEntry},
    git::{GitDiff, GitStatus},
    projects::ProjectSummary,
    terminal::{TerminalEvent, TerminalSummary},
};
use std::path::PathBuf;
use tauri::{ipc::Channel, AppHandle, State};
use tauri_plugin_clipboard_manager::ClipboardExt;
use tauri_plugin_dialog::DialogExt;
use tauri_plugin_opener::OpenerExt;
use uuid::Uuid;

#[tauri::command]
pub fn project_list(state: State<'_, AppState>) -> CommandResult<Vec<ProjectSummary>> {
    state.projects.list()
}
#[tauri::command]
pub fn project_open_path(
    path: String,
    state: State<'_, AppState>,
) -> CommandResult<ProjectSummary> {
    state.open_project(&PathBuf::from(path))
}
#[tauri::command]
pub fn project_open_dialog(
    app: AppHandle,
    state: State<'_, AppState>,
) -> CommandResult<Option<ProjectSummary>> {
    let selected = app.dialog().file().blocking_pick_folder();
    selected
        .map(|path| {
            path.into_path()
                .map_err(|error| CommandError::new("INVALID_ARGUMENT", error.to_string()))
                .and_then(|path| state.open_project(&path))
        })
        .transpose()
}
#[tauri::command]
pub fn project_close(
    project_id: Uuid,
    state: State<'_, AppState>,
) -> CommandResult<ProjectSummary> {
    state.close_project(project_id)
}
#[tauri::command]
pub fn project_reveal(
    project_id: Uuid,
    app: AppHandle,
    state: State<'_, AppState>,
) -> CommandResult<()> {
    let root = state.projects.root(project_id)?;
    app.opener()
        .reveal_item_in_dir(root)
        .map_err(|error| CommandError::new("INVALID_ARGUMENT", error.to_string()))
}
#[tauri::command]
pub fn project_copy_path(
    project_id: Uuid,
    app: AppHandle,
    state: State<'_, AppState>,
) -> CommandResult<()> {
    let root = state.projects.root(project_id)?;
    app.clipboard()
        .write_text(root.to_string_lossy())
        .map_err(|error| CommandError::new("INVALID_ARGUMENT", error.to_string()))
}
#[tauri::command]
pub fn fs_read_dir(
    project_id: Uuid,
    relative_path: String,
    state: State<'_, AppState>,
) -> CommandResult<Vec<FileEntry>> {
    filesystem::read_dir(&state.projects, project_id, &relative_path)
}
#[tauri::command]
pub fn fs_read_file(
    project_id: Uuid,
    relative_path: String,
    state: State<'_, AppState>,
) -> CommandResult<FileContent> {
    filesystem::read_file(&state.projects, project_id, &relative_path)
}
#[tauri::command]
pub fn git_status(project_id: Uuid, state: State<'_, AppState>) -> CommandResult<GitStatus> {
    state.git.status(&state.projects, project_id)
}
#[tauri::command]
pub fn git_diff_file(
    project_id: Uuid,
    relative_path: String,
    scope: String,
    state: State<'_, AppState>,
) -> CommandResult<GitDiff> {
    state
        .git
        .diff_file(&state.projects, project_id, &relative_path, &scope)
}
#[tauri::command]
pub fn terminal_create(
    project_id: Uuid,
    cols: u16,
    rows: u16,
    state: State<'_, AppState>,
) -> CommandResult<TerminalSummary> {
    let root = state.projects.root(project_id)?;
    state.terminals.create(project_id, &root, cols, rows)
}
#[tauri::command]
pub fn terminal_attach(
    terminal_id: Uuid,
    on_event: Channel<TerminalEvent>,
    state: State<'_, AppState>,
) -> CommandResult<()> {
    state.terminals.attach(terminal_id, on_event)
}
#[tauri::command]
pub fn terminal_write(
    terminal_id: Uuid,
    data: String,
    state: State<'_, AppState>,
) -> CommandResult<()> {
    state.terminals.write(terminal_id, &data)
}
#[tauri::command]
pub fn terminal_resize(
    terminal_id: Uuid,
    cols: u16,
    rows: u16,
    state: State<'_, AppState>,
) -> CommandResult<()> {
    state.terminals.resize(terminal_id, cols, rows)
}
#[tauri::command]
pub fn terminal_close(
    terminal_id: Uuid,
    force: bool,
    state: State<'_, AppState>,
) -> CommandResult<()> {
    state.terminals.close(terminal_id, force)
}
#[tauri::command]
pub fn terminal_list(
    project_id: Option<Uuid>,
    state: State<'_, AppState>,
) -> CommandResult<Vec<TerminalSummary>> {
    state.terminals.list(project_id)
}
