mod app_state;
mod commands;
mod error;
mod filesystem;
mod git;
mod persistence;
mod projects;
mod terminal;
mod worktrees;

use app_state::AppState;
use filesystem::watcher::{EventSink, WatchEvent};
use std::sync::Arc;
use tauri::{Emitter, Manager};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .setup(|app| {
            let data_dir = app.path().app_data_dir()?;
            let handle = app.handle().clone();
            let event_sink: EventSink = Arc::new(move |event| {
                let result = match event {
                    WatchEvent::Filesystem(payload) => handle.emit("filesystem://changed", payload),
                    WatchEvent::Git(payload) => handle.emit("git://changed", payload),
                };
                if let Err(error) = result {
                    eprintln!("failed to emit project change: {error}");
                }
            });
            let state = AppState::new(data_dir, event_sink)?;
            app.manage(state);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::project_list,
            commands::project_catalog,
            commands::project_open_dialog,
            commands::project_open_path,
            commands::project_close,
            commands::project_reveal,
            commands::project_copy_path,
            commands::fs_read_dir,
            commands::fs_read_file,
            commands::git_status,
            commands::git_diff_file,
            commands::git_list_origin_branches,
            commands::project_add_origin,
            commands::worktree_create,
            commands::worktree_select,
            commands::worktree_list,
            commands::worktree_reveal,
            commands::worktree_rename,
            commands::worktree_inspect_delete,
            commands::worktree_delete,
            commands::terminal_create,
            commands::terminal_attach,
            commands::terminal_write,
            commands::terminal_resize,
            commands::terminal_close,
            commands::terminal_list,
        ])
        .run(tauri::generate_context!())
        .expect("error while running Tauri application");
}
