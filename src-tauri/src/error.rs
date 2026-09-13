use serde::Serialize;
use std::{collections::BTreeMap, fmt, io};

pub type CommandResult<T> = Result<T, CommandError>;

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct CommandError {
    pub code: String,
    pub message: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub details: Option<BTreeMap<String, String>>,
}

impl CommandError {
    pub fn new(code: &str, message: impl Into<String>) -> Self {
        Self {
            code: code.into(),
            message: message.into(),
            details: None,
        }
    }

    pub fn io(error: io::Error) -> Self {
        let code = match error.kind() {
            io::ErrorKind::NotFound => "NOT_FOUND",
            io::ErrorKind::PermissionDenied => "PERMISSION_DENIED",
            _ => "INVALID_ARGUMENT",
        };
        Self::new(code, error.to_string())
    }

    pub fn detail(mut self, key: &str, value: impl Into<String>) -> Self {
        self.details
            .get_or_insert_with(BTreeMap::new)
            .insert(key.into(), value.into());
        self
    }
}

impl fmt::Display for CommandError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{}: {}", self.code, self.message)
    }
}

impl std::error::Error for CommandError {}
