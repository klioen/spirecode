CREATE TABLE task_session_archives (
  task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE RESTRICT,
  session_id TEXT NOT NULL,
  sha256 TEXT NOT NULL,
  size INTEGER NOT NULL CHECK (size >= 0),
  created_at INTEGER NOT NULL,
  PRIMARY KEY (task_id, session_id)
) STRICT;
CREATE TABLE task_run_retention (
  run_id TEXT PRIMARY KEY REFERENCES task_runs(id) ON DELETE RESTRICT,
  archive_kind TEXT CHECK (archive_kind IN ('archived','empty')),
  token_count INTEGER CHECK (token_count >= 0),
  duration_ms INTEGER CHECK (duration_ms >= 0),
  frozen_at INTEGER
) STRICT;
CREATE TABLE task_artifact_archives (
  task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE RESTRICT,
  run_id TEXT NOT NULL REFERENCES task_runs(id) ON DELETE RESTRICT,
  relative_path TEXT NOT NULL,
  sha256 TEXT NOT NULL,
  size INTEGER NOT NULL CHECK (size >= 0),
  created_at INTEGER NOT NULL,
  PRIMARY KEY (run_id, relative_path)
) STRICT;
CREATE TABLE task_archive_states (
  task_id TEXT PRIMARY KEY REFERENCES tasks(id) ON DELETE RESTRICT,
  status TEXT NOT NULL CHECK (status IN ('intent','ready','failed')),
  error_code TEXT,
  updated_at INTEGER NOT NULL,
  artifacts_json TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(artifacts_json))
) STRICT;
