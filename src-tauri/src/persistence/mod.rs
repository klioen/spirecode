use crate::error::{CommandError, CommandResult};
#[cfg(test)]
use serde::de::DeserializeOwned;
use serde::Serialize;
use std::{fs, io::Write, path::Path};

#[cfg(test)]
pub fn load_or_default<T: DeserializeOwned + Default>(path: &Path) -> CommandResult<T> {
    match fs::read(path) {
        Ok(bytes) => match serde_json::from_slice(&bytes) {
            Ok(value) => Ok(value),
            Err(error) => {
                let backup = path.with_extension("corrupt.json");
                fs::rename(path, &backup).map_err(CommandError::io)?;
                eprintln!(
                    "warning: durable state was corrupt ({error}); backed up to {} and reset",
                    backup.display()
                );
                Ok(T::default())
            }
        },
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(T::default()),
        Err(error) => Err(CommandError::io(error)),
    }
}

pub fn save_atomic<T: Serialize>(path: &Path, value: &T) -> CommandResult<()> {
    let parent = path
        .parent()
        .ok_or_else(|| CommandError::new("INVALID_ARGUMENT", "state path has no parent"))?;
    fs::create_dir_all(parent).map_err(CommandError::io)?;
    let temp = parent.join(format!(
        ".{}.{}.tmp",
        path.file_name().unwrap_or_default().to_string_lossy(),
        uuid::Uuid::new_v4()
    ));
    let result = (|| {
        let mut file = fs::OpenOptions::new()
            .create_new(true)
            .write(true)
            .open(&temp)
            .map_err(CommandError::io)?;
        serde_json::to_writer_pretty(&mut file, value)
            .map_err(|error| CommandError::new("INVALID_ARGUMENT", error.to_string()))?;
        file.write_all(b"\n").map_err(CommandError::io)?;
        file.sync_all().map_err(CommandError::io)?;
        fs::rename(&temp, path).map_err(CommandError::io)?;
        fs::File::open(parent)
            .and_then(|dir| dir.sync_all())
            .map_err(CommandError::io)
    })();
    if result.is_err() {
        let _ = fs::remove_file(temp);
    }
    result
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde::{Deserialize, Serialize};
    use std::time::{SystemTime, UNIX_EPOCH};

    #[derive(Default, Debug, Serialize, Deserialize, PartialEq)]
    struct Value {
        value: u8,
    }

    fn temp() -> std::path::PathBuf {
        std::env::temp_dir().join(format!(
            "spirecode-persistence-{}",
            SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ))
    }

    #[test]
    fn atomic_round_trip_and_corrupt_backup() {
        let dir = temp();
        let path = dir.join("state.json");
        save_atomic(&path, &Value { value: 7 }).unwrap();
        assert_eq!(load_or_default::<Value>(&path).unwrap(), Value { value: 7 });
        fs::write(&path, b"bad json").unwrap();
        assert_eq!(load_or_default::<Value>(&path).unwrap(), Value::default());
        assert!(dir.join("state.corrupt.json").exists());
        fs::remove_dir_all(dir).unwrap();
    }
}
