use crate::{
    error::{CommandError, CommandResult},
    projects::ProjectService,
};
use ignore::WalkBuilder;
use serde::Serialize;
use std::{
    fs,
    path::{Component, Path, PathBuf},
};
use uuid::Uuid;

pub mod watcher;

pub const MAX_TEXT_BYTES: u64 = 5 * 1024 * 1024;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FileEntry {
    pub name: String,
    pub relative_path: String,
    pub kind: EntryKind,
    pub size: Option<u64>,
}
#[derive(Debug, Serialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum EntryKind {
    Directory,
    File,
    Symlink,
}
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FileContent {
    pub relative_path: String,
    pub content: String,
    pub size: u64,
}

pub fn resolve(root: &Path, relative: &str, must_exist: bool) -> CommandResult<PathBuf> {
    let root = root.canonicalize().map_err(CommandError::io)?;
    let relative = Path::new(relative);
    if relative.is_absolute()
        || relative
            .components()
            .any(|part| !matches!(part, Component::Normal(_)))
    {
        if relative.as_os_str().is_empty() {
            return Ok(root);
        }
        return Err(CommandError::new(
            "OUTSIDE_PROJECT",
            "path must contain only normal relative components",
        ));
    }
    if relative
        .components()
        .any(|part| matches!(part, Component::Normal(value) if value == ".git"))
    {
        return Err(CommandError::new(
            "OUTSIDE_PROJECT",
            ".git is not accessible",
        ));
    }
    let target = root.join(relative);
    let canonical = if must_exist {
        target.canonicalize().map_err(CommandError::io)?
    } else {
        canonicalize_with_missing_tail(&target)?
    };
    if !canonical.starts_with(&root) {
        return Err(CommandError::new(
            "OUTSIDE_PROJECT",
            "resolved path is outside project",
        ));
    }
    Ok(canonical)
}

fn canonicalize_with_missing_tail(target: &Path) -> CommandResult<PathBuf> {
    let mut existing = target;
    let mut missing = Vec::new();
    while !existing.exists() {
        let name = existing
            .file_name()
            .ok_or_else(|| CommandError::new("OUTSIDE_PROJECT", "path has no existing ancestor"))?;
        missing.push(name.to_os_string());
        existing = existing
            .parent()
            .ok_or_else(|| CommandError::new("OUTSIDE_PROJECT", "path has no existing ancestor"))?;
    }
    let mut resolved = existing.canonicalize().map_err(CommandError::io)?;
    for component in missing.iter().rev() {
        resolved.push(component);
    }
    Ok(resolved)
}

pub fn read_dir(
    projects: &ProjectService,
    id: Uuid,
    relative: &str,
) -> CommandResult<Vec<FileEntry>> {
    let root = projects.root(id)?;
    let directory = resolve(&root, relative, true)?;
    if !directory.is_dir() {
        return Err(CommandError::new(
            "INVALID_ARGUMENT",
            "path is not a directory",
        ));
    }
    let mut entries = Vec::new();
    let mut builder = WalkBuilder::new(&directory);
    builder
        .max_depth(Some(1))
        .hidden(false)
        .parents(true)
        .git_ignore(true)
        .git_global(true)
        .git_exclude(true);
    for item in builder.build().skip(1) {
        let item =
            item.map_err(|error| CommandError::new("PERMISSION_DENIED", error.to_string()))?;
        let path = item.path();
        let canonical = path.canonicalize().map_err(CommandError::io)?;
        if !canonical.starts_with(&root) {
            continue;
        }
        let rel = path
            .strip_prefix(&root)
            .map_err(|_| CommandError::new("OUTSIDE_PROJECT", "path escaped project"))?;
        if rel
            .components()
            .any(|part| matches!(part, Component::Normal(value) if value == ".git"))
        {
            continue;
        }
        let metadata = fs::symlink_metadata(path).map_err(CommandError::io)?;
        let kind = if metadata.file_type().is_symlink() {
            EntryKind::Symlink
        } else if metadata.is_dir() {
            EntryKind::Directory
        } else {
            EntryKind::File
        };
        entries.push(FileEntry {
            name: path
                .file_name()
                .unwrap_or_default()
                .to_string_lossy()
                .into_owned(),
            relative_path: rel.to_string_lossy().into_owned(),
            size: metadata.is_file().then_some(metadata.len()),
            kind,
        });
    }
    entries.sort_by(|a, b| {
        matches!(b.kind, EntryKind::Directory)
            .cmp(&matches!(a.kind, EntryKind::Directory))
            .then_with(|| natural_key(&a.name).cmp(&natural_key(&b.name)))
    });
    Ok(entries)
}

pub fn read_file(
    projects: &ProjectService,
    id: Uuid,
    relative: &str,
) -> CommandResult<FileContent> {
    let root = projects.root(id)?;
    let path = resolve(&root, relative, true)?;
    let metadata = fs::metadata(&path).map_err(CommandError::io)?;
    if !metadata.is_file() {
        return Err(CommandError::new(
            "UNSUPPORTED_FILE",
            "path is not a regular file",
        ));
    }
    if metadata.len() > MAX_TEXT_BYTES {
        return Err(CommandError::new(
            "FILE_TOO_LARGE",
            "file exceeds 5 MiB text limit",
        ));
    }
    let bytes = fs::read(path).map_err(CommandError::io)?;
    if bytes.contains(&0) {
        return Err(CommandError::new(
            "UNSUPPORTED_FILE",
            "binary file is not supported",
        ));
    }
    let content = String::from_utf8(bytes)
        .map_err(|_| CommandError::new("UNSUPPORTED_FILE", "file is not valid UTF-8"))?;
    Ok(FileContent {
        relative_path: relative.into(),
        size: metadata.len(),
        content,
    })
}

fn natural_key(value: &str) -> Vec<String> {
    let mut parts = Vec::new();
    let mut current = String::new();
    let mut digits = None;
    for character in value.chars() {
        let is_digit = character.is_ascii_digit();
        if digits.is_some_and(|old| old != is_digit) {
            parts.push(if digits == Some(true) {
                format!("{:020}", current.parse::<u64>().unwrap_or(0))
            } else {
                current.to_lowercase()
            });
            current.clear();
        }
        digits = Some(is_digit);
        current.push(character);
    }
    if !current.is_empty() {
        parts.push(if digits == Some(true) {
            format!("{:020}", current.parse::<u64>().unwrap_or(0))
        } else {
            current.to_lowercase()
        });
    }
    parts
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
            "pi-app-fs-{}",
            SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ))
    }
    #[test]
    fn rejects_traversal_git_binary_and_oversized_files() {
        let root = temp();
        fs::create_dir_all(&root).unwrap();
        assert!(std::process::Command::new("git")
            .args(["init", "-q"])
            .current_dir(&root)
            .status()
            .unwrap()
            .success());
        fs::write(root.join("bin"), b"a\0b").unwrap();
        let state = root.join("app/state.json");
        let projects = ProjectService::load(state).unwrap();
        let project = projects.open_path(&root).unwrap();
        assert_eq!(
            resolve(&root, "../secret", true).unwrap_err().code,
            "OUTSIDE_PROJECT"
        );
        assert_eq!(
            resolve(&root, ".git/config", true).unwrap_err().code,
            "OUTSIDE_PROJECT"
        );
        assert_eq!(
            resolve(&root, "missing/nested/file.txt", false).unwrap(),
            root.canonicalize().unwrap().join("missing/nested/file.txt")
        );
        assert_eq!(
            read_file(&projects, project.id, "bin").unwrap_err().code,
            "UNSUPPORTED_FILE"
        );
        let large = fs::File::create(root.join("large")).unwrap();
        large.set_len(MAX_TEXT_BYTES + 1).unwrap();
        assert_eq!(
            read_file(&projects, project.id, "large").unwrap_err().code,
            "FILE_TOO_LARGE"
        );
        fs::remove_dir_all(root).unwrap();
    }
    #[cfg(unix)]
    #[test]
    fn rejects_symlink_escape() {
        use std::os::unix::fs::symlink;
        let root = temp();
        fs::create_dir_all(&root).unwrap();
        symlink(std::env::temp_dir(), root.join("escape")).unwrap();
        assert_eq!(
            resolve(&root, "escape", true).unwrap_err().code,
            "OUTSIDE_PROJECT"
        );
        fs::remove_dir_all(root).unwrap();
    }
}
