import { constants } from "node:fs";
import {
  readdir,
  lstat,
  mkdir,
  open,
  realpath,
  rename,
  unlink,
} from "node:fs/promises";
import { createHash, randomUUID } from "node:crypto";
import path from "node:path";
import type { TaskRun } from "./types.js";
import { TaskRepository } from "./repository.js";
import {
  TaskArchiveRepository,
  type ArchiveFile,
} from "./archiveRepository.js";
import { parseSessionTokenCount, taskRunDurationMs } from "./sessionMetrics.js";
import { validateId } from "./validation.js";

const SESSION_LIMIT = 32 * 1024 * 1024;
const ARTIFACT_LIMIT = 10 * 1024 * 1024;
export interface ArtifactSelection {
  runId: string;
  relativePath: string;
}
export interface ArchiveEntry {
  id: string;
  type: string;
  role?: string;
  text: string;
  truncated: boolean;
}
export class TaskArchiveError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "TaskArchiveError";
  }
}
function fail(code: string, message: string): never {
  throw new TaskArchiveError(code, message);
}
function inside(root: string, file: string) {
  const relative = path.relative(root, file);
  return (
    relative !== "" &&
    relative !== ".." &&
    !relative.startsWith(`..${path.sep}`) &&
    !path.isAbsolute(relative)
  );
}
export function artifactPath(value: unknown): string {
  if (
    typeof value !== "string" ||
    !value ||
    Buffer.byteLength(value) > 1024 ||
    value.includes("\\") ||
    value.includes("\0") ||
    value.includes(":")
  )
    fail(
      "TASK_ARCHIVE_INVALID",
      "Artifact path must be a bounded relative file path.",
    );
  const segments = value.split("/");
  if (
    segments.some(
      (segment) =>
        !segment ||
        segment === "." ||
        segment === ".." ||
        segment.toLowerCase() === ".git" ||
        /[. ]$/.test(segment),
    )
  )
    fail(
      "TASK_ARCHIVE_INVALID",
      "Artifact path cannot escape the workspace or access Git metadata.",
    );
  return value;
}
async function checked(root: string, file: string, directories = false) {
  if (!inside(root, file))
    fail("TASK_ARCHIVE_UNSAFE", "Archive file is outside its allowed root.");
  let current = root;
  const segments = path.relative(root, file).split(path.sep);
  for (let index = 0; index < segments.length; index++) {
    current = path.join(current, segments[index]);
    const metadata = await lstat(current);
    if (
      metadata.isSymbolicLink() ||
      (index < segments.length - 1 || directories
        ? !metadata.isDirectory()
        : !metadata.isFile())
    )
      fail(
        "TASK_ARCHIVE_UNSAFE",
        "Archive paths must not contain symlinks or special files.",
      );
  }
  if (!inside(root, await realpath(file)))
    fail("TASK_ARCHIVE_UNSAFE", "Archive file escaped its allowed root.");
}
async function readSafe(root: string, file: string, limit: number) {
  const originalRoot = path.resolve(root);
  root = await realpath(originalRoot);
  if (inside(originalRoot, path.resolve(file)))
    file = path.join(root, path.relative(originalRoot, path.resolve(file)));
  await checked(root, file);
  const handle = await open(
    file,
    constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0),
  );
  try {
    const before = await handle.stat();
    if (!before.isFile() || before.size > limit)
      fail(
        "TASK_ARCHIVE_LIMIT",
        "Archive file exceeds the supported size limit; no source file was deleted.",
      );
    const buffer = Buffer.alloc(before.size);
    let offset = 0;
    while (offset < buffer.length) {
      const read = await handle.read(
        buffer,
        offset,
        buffer.length - offset,
        offset,
      );
      if (!read.bytesRead)
        fail("TASK_ARCHIVE_CHANGED", "Source file changed while archiving.");
      offset += read.bytesRead;
    }
    const after = await handle.stat();
    await checked(root, file);
    const named = await lstat(file);
    if (
      before.size !== after.size ||
      before.mtimeMs !== after.mtimeMs ||
      before.ino !== named.ino ||
      before.dev !== named.dev
    )
      fail("TASK_ARCHIVE_CHANGED", "Source file changed while archiving.");
    return buffer;
  } finally {
    await handle.close();
  }
}
function checksum(buffer: Buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}
function parseSession(buffer: Buffer, sessionId: string) {
  let lines: string[];
  try {
    lines = new TextDecoder("utf-8", { fatal: true })
      .decode(buffer)
      .split("\n");
  } catch {
    fail("TASK_ARCHIVE_CORRUPT", "Session is not valid UTF-8 JSONL.");
  }
  const entries: Record<string, unknown>[] = [];
  for (const line of lines) {
    if (!line.trim()) continue;
    try {
      const entry: unknown = JSON.parse(line);
      if (!entry || typeof entry !== "object" || Array.isArray(entry))
        throw new Error();
      if (entries.length >= 50000)
        fail(
          "TASK_ARCHIVE_LIMIT",
          "Session has too many records for safe inline history.",
        );
      entries.push(entry as Record<string, unknown>);
    } catch (error) {
      if (error instanceof TaskArchiveError) throw error;
      fail(
        "TASK_ARCHIVE_CORRUPT",
        "Session contains an incomplete or invalid JSONL record. Original files were retained.",
      );
    }
  }
  const header = entries.shift();
  if (
    header?.type !== "session" ||
    header.id !== sessionId ||
    typeof header.cwd !== "string"
  )
    fail(
      "TASK_ARCHIVE_UNSAFE",
      "Session identity does not match this Task run.",
    );
  return entries;
}
export async function discoverTaskSessions(sessionRoot: string, ids: string[]) {
  const wanted = new Set(ids.map((id) => validateId(id)));
  const result = new Map<string, string>();
  let root: string;
  try {
    root = await realpath(sessionRoot);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return result;
    throw error;
  }
  let inspected = 0;
  const scan = async (directory: string, descend: boolean) => {
    if (directory !== root) await checked(root, directory, true);
    const entries = await readdir(directory, { withFileTypes: true });
    for (const entry of entries) {
      if (++inspected > 100000)
        fail(
          "TASK_ARCHIVE_LIMIT",
          "Session catalog exceeds the safe lookup limit.",
        );
      if (entry.isSymbolicLink()) continue;
      const candidate = path.join(directory, entry.name);
      if (descend && entry.isDirectory()) {
        await scan(candidate, false);
        continue;
      }
      if (!entry.isFile() || !entry.name.endsWith(".jsonl")) continue;
      const id = entry.name.slice(0, -6).split("_").at(-1)!;
      if (!wanted.has(id)) continue;
      await checked(root, candidate);
      if (result.has(id))
        fail("TASK_ARCHIVE_UNSAFE", "Duplicate retained session identity.");
      result.set(id, candidate);
    }
  };
  await scan(root, true);
  return result;
}

export interface TaskArchiveOptions {
  dataDirectory: string;
  sessionRoot: string;
  resolveSessions(runs: TaskRun[]): Promise<Map<string, string>>;
  workspaceRoot(worktreeId: string): Promise<string>;
}
export class TaskArchiveService {
  readonly metadata: TaskArchiveRepository;
  constructor(
    readonly tasks: TaskRepository,
    readonly options: TaskArchiveOptions,
  ) {
    this.metadata = new TaskArchiveRepository(tasks.connection);
  }
  async root() {
    const data = await realpath(this.options.dataDirectory);
    const root = path.join(data, "task-archives");
    await mkdir(root, { recursive: true, mode: 0o700 });
    await checked(data, root, true);
    return root;
  }
  sessionFile(root: string, taskId: string, sessionId: string) {
    return path.join(root, taskId, "sessions", `${sessionId}.jsonl`);
  }
  async write(
    root: string,
    destination: string,
    buffer: Buffer,
    existing?: ArchiveFile,
  ) {
    const sha256 = checksum(buffer);
    if (existing) {
      if (existing.sha256 !== sha256)
        fail(
          "TASK_ARCHIVE_CHANGED",
          "An immutable Task archive cannot be replaced with different content.",
        );
      await this.verify(root, destination, existing);
      return existing;
    }
    let directory = root;
    for (const segment of path
      .relative(root, path.dirname(destination))
      .split(path.sep)
      .filter(Boolean)) {
      directory = path.join(directory, segment);
      await mkdir(directory, { recursive: true, mode: 0o700 });
      await checked(root, directory, true);
    }
    const temporary = `${destination}.${randomUUID()}.tmp`;
    try {
      const handle = await open(
        temporary,
        constants.O_CREAT |
          constants.O_EXCL |
          constants.O_WRONLY |
          (constants.O_NOFOLLOW ?? 0),
        0o600,
      );
      try {
        await handle.writeFile(buffer);
        await handle.sync();
      } finally {
        await handle.close();
      }
      await checked(root, path.dirname(destination), true);
      await rename(temporary, destination);
      const durableFile = await open(
        destination,
        constants.O_RDWR | (constants.O_NOFOLLOW ?? 0),
      );
      try {
        await durableFile.sync();
      } finally {
        await durableFile.close();
      }
      if (process.platform !== "win32") {
        let directory = path.dirname(destination);
        while (
          inside(root, directory) ||
          directory === root ||
          directory === path.dirname(root)
        ) {
          const durableDirectory = await open(directory, constants.O_RDONLY);
          try {
            await durableDirectory.sync();
          } finally {
            await durableDirectory.close();
          }
          if (directory === path.dirname(root)) break;
          directory = path.dirname(directory);
        }
      }
      const file = { sha256, size: buffer.length, created_at: Date.now() };
      await this.verify(root, destination, file);
      return file;
    } finally {
      await unlink(temporary).catch(() => undefined);
    }
  }
  async verify(root: string, file: string, expected: ArchiveFile) {
    const buffer = await readSafe(root, file, SESSION_LIMIT);
    if (buffer.length !== expected.size || checksum(buffer) !== expected.sha256)
      fail(
        "TASK_ARCHIVE_CORRUPT",
        "Archived file failed integrity verification. No cleanup was authorized.",
      );
    return buffer;
  }
  requireRun(taskId: string, runId: string) {
    validateId(taskId);
    validateId(runId);
    const run = this.tasks.getRun(runId);
    if (!run || run.taskId !== taskId)
      fail("TASK_NOT_FOUND", "Task run was not found.");
    if (run.sessionId) validateId(run.sessionId);
    return run;
  }
  freeze(run: TaskRun, contents: Buffer, source: string | null) {
    this.metadata.freeze(
      run.id,
      source,
      parseSessionTokenCount(
        contents.toString("utf8"),
        run.startedAt === null
          ? { startedAt: 0, endedAt: 0 }
          : {
              startedAt: run.startedAt,
              endedAt: (run.finishedAt ?? run.settledAt ?? Date.now()) + 1,
            },
      ),
      taskRunDurationMs(run),
    );
  }
  async finalize(runId: string) {
    const run = this.tasks.getRun(runId);
    if (
      !run ||
      !["reported", "failed", "cancelled"].includes(run.status) ||
      this.metadata.retention(runId)?.frozen_at
    )
      return;
    if (!run.sessionId) {
      if (run.startedAt === null && !run.report)
        this.freeze(run, Buffer.alloc(0), null);
      return;
    }
    validateId(run.sessionId);
    const sources = await this.options.resolveSessions([run]);
    const source = sources.get(run.sessionId);
    if (!source) {
      if (run.startedAt === null && !run.report)
        this.freeze(run, Buffer.alloc(0), null);
      return;
    }
    const contents = await readSafe(
      this.options.sessionRoot,
      source,
      SESSION_LIMIT,
    );
    parseSession(contents, run.sessionId);
    if (
      (run.startedAt !== null || run.report) &&
      !contents.toString("utf8").includes(run.promptMarker)
    )
      fail(
        "TASK_ARCHIVE_UNSAFE",
        "Session does not contain this Task run's prompt marker.",
      );
    this.freeze(run, contents, source);
  }
  async archive(taskId: string, artifacts: ArtifactSelection[] = []) {
    validateId(taskId);
    const task = this.tasks.getTask(taskId);
    if (
      !task ||
      !["completed", "failed", "cancelled"].includes(task.status) ||
      task.activeRunId
    )
      fail("TASK_INVALID_STATE", "Only terminal idle Tasks can be archived.");
    if (artifacts.length > 20)
      fail("TASK_ARCHIVE_LIMIT", "Select at most 20 artifact files.");
    const runs = this.tasks.listAllRuns(taskId);
    for (const run of runs) {
      validateId(run.id);
      if (run.sessionId) validateId(run.sessionId);
    }
    if (runs.length > 1000)
      fail("TASK_ARCHIVE_LIMIT", "Task has too many runs to archive safely.");
    const saved = JSON.parse(
      this.metadata.state(taskId)?.artifacts_json ?? "[]",
    ) as ArtifactSelection[];
    const selections = new Map<string, ArtifactSelection>();
    for (const item of [...saved, ...artifacts]) {
      this.requireRun(taskId, item.runId);
      const relativePath = artifactPath(item.relativePath);
      const key = `${item.runId}:${relativePath.toLowerCase()}`;
      const previous = selections.get(key);
      if (previous && previous.relativePath !== relativePath)
        fail(
          "TASK_ARCHIVE_INVALID",
          "Artifact selections contain ambiguous case-sensitive paths.",
        );
      selections.set(key, {
        runId: item.runId,
        relativePath,
      });
    }
    if (selections.size > 20)
      fail("TASK_ARCHIVE_LIMIT", "Select at most 20 artifact files.");
    this.metadata.begin(taskId, [...selections.values()]);
    try {
      const root = await this.root();
      const required = runs.filter(
        (run) => run.sessionId && !this.metadata.session(taskId, run.sessionId),
      );
      const sources = required.length
        ? await this.options.resolveSessions(required)
        : new Map<string, string>();
      let total = this.metadata.sessionBytes(taskId);
      if (total > 128 * 1024 * 1024)
        fail(
          "TASK_ARCHIVE_LIMIT",
          "Task sessions exceed the archive size limit.",
        );
      for (const run of runs) {
        let contents = Buffer.alloc(0);
        let source: string | null = null;
        if (run.sessionId) {
          const file = this.metadata.session(taskId, run.sessionId);
          if (file)
            contents = await this.verify(
              root,
              this.sessionFile(root, taskId, run.sessionId),
              file,
            );
          else {
            source = sources.get(run.sessionId) ?? null;
            if (source) {
              contents = await readSafe(
                this.options.sessionRoot,
                source,
                SESSION_LIMIT,
              );
              parseSession(contents, run.sessionId);
              if (
                (run.startedAt !== null || run.report) &&
                !contents.toString("utf8").includes(run.promptMarker)
              )
                fail(
                  "TASK_ARCHIVE_UNSAFE",
                  "Session does not contain this Task run's prompt marker.",
                );
              total += contents.length;
              if (total > 128 * 1024 * 1024)
                fail(
                  "TASK_ARCHIVE_LIMIT",
                  "Task sessions exceed the archive size limit.",
                );
              const archived = await this.write(
                root,
                this.sessionFile(root, taskId, run.sessionId),
                contents,
              );
              this.metadata.saveSession(taskId, run.sessionId, archived);
            } else if (run.startedAt !== null || run.report)
              fail(
                "TASK_ARCHIVE_MISSING",
                "A Task session record is missing. Restore it before cleaning the workspace.",
              );
          }
        } else if (run.startedAt !== null || run.report)
          fail(
            "TASK_ARCHIVE_MISSING",
            "A completed run is missing its session identity.",
          );
        if (contents.length && run.sessionId) {
          parseSession(contents, run.sessionId);
          if (
            (run.startedAt !== null || run.report) &&
            !contents.toString("utf8").includes(run.promptMarker)
          )
            fail(
              "TASK_ARCHIVE_UNSAFE",
              "Session does not contain this Task run's prompt marker.",
            );
        }
        this.freeze(run, contents, source);
        this.metadata.markRun(run.id, contents.length ? "archived" : "empty");
      }
      let artifactBytes = this.metadata
        .artifacts(taskId)
        .reduce((total, file) => total + file.size, 0);
      for (const selection of selections.values()) {
        const run = this.requireRun(taskId, selection.runId);
        const relative = artifactPath(selection.relativePath);
        const existing = this.metadata
          .artifacts(taskId, run.id)
          .find((file) => file.relative_path === relative);
        const destination = path.join(
          root,
          taskId,
          "artifacts",
          run.id,
          ...relative.split("/"),
        );
        if (existing) {
          await this.verify(root, destination, existing);
          continue;
        }
        if (!run.worktreeId || task.workspaceCleanupStatus === "removed")
          fail("TASK_ARCHIVE_MISSING", "Artifact workspace is unavailable.");
        const workspace = await realpath(
          await this.options.workspaceRoot(run.worktreeId),
        );
        const buffer = await readSafe(
          workspace,
          path.join(workspace, ...relative.split("/")),
          ARTIFACT_LIMIT,
        );
        artifactBytes += buffer.length;
        if (
          artifactBytes > 50 * 1024 * 1024 ||
          this.metadata.artifacts(taskId).length >= 20
        )
          fail(
            "TASK_ARCHIVE_LIMIT",
            "Task artifacts exceed the archive limit.",
          );
        const file = await this.write(root, destination, buffer);
        this.metadata.saveArtifact(taskId, run.id, relative, file);
      }
      for (const file of this.metadata.artifacts(taskId))
        await this.verify(
          root,
          path.join(
            root,
            taskId,
            "artifacts",
            file.run_id,
            ...artifactPath(file.relative_path).split("/"),
          ),
          file,
        );
      this.metadata.setState(taskId, "ready");
    } catch (error) {
      this.metadata.setState(
        taskId,
        "failed",
        error instanceof TaskArchiveError ? error.code : "TASK_ARCHIVE_FAILED",
      );
      if (error instanceof TaskArchiveError) throw error;
      fail(
        "TASK_ARCHIVE_FAILED",
        "Task archive could not be saved or verified. No source files were deleted.",
      );
    } finally {
      this.tasks.connection
        .prepare(
          "UPDATE tasks SET revision=revision+1, updated_at=? WHERE id=?",
        )
        .run(Date.now(), taskId);
    }
  }
  async recover() {
    const rows = this.tasks.connection
      .prepare("SELECT task_id FROM task_archive_states WHERE status='intent'")
      .all() as unknown as Array<{ task_id: string }>;
    for (const row of rows) {
      try {
        await this.archive(row.task_id);
      } catch {
        /* The durable archive state records failure and retains its source. */
      }
    }
  }

  async read(taskId: string, runId: string, limit: number, cursor?: string) {
    const run = this.requireRun(taskId, runId);
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 20)
      fail(
        "TASK_ARCHIVE_INVALID",
        "Archive page limit must be between 1 and 20.",
      );
    const file = run.sessionId
      ? this.metadata.session(taskId, run.sessionId)
      : undefined;
    if (!file || this.metadata.retention(runId)?.archive_kind !== "archived")
      fail(
        "TASK_ARCHIVE_MISSING",
        "No archived session is available for this run.",
      );
    let offset = 0;
    if (cursor) {
      try {
        if (cursor.length > 4096) throw new Error();
        const value = JSON.parse(Buffer.from(cursor, "base64url").toString());
        if (
          value.taskId !== taskId ||
          value.runId !== runId ||
          value.sha256 !== file.sha256 ||
          !Number.isSafeInteger(value.offset) ||
          value.offset < 0
        )
          throw new Error();
        offset = value.offset;
      } catch {
        fail(
          "TASK_ARCHIVE_INVALID",
          "Archive cursor is invalid or belongs to another run.",
        );
      }
    }
    const root = await this.root();
    const entries = parseSession(
      await this.verify(
        root,
        this.sessionFile(root, taskId, run.sessionId!),
        file,
      ),
      run.sessionId!,
    );
    if (offset > entries.length)
      fail("TASK_ARCHIVE_INVALID", "Archive cursor is out of range.");
    const selected: ArchiveEntry[] = [];
    let size = 0;
    for (const [index, entry] of entries
      .slice(offset, offset + limit)
      .entries()) {
      const message =
        entry.message && typeof entry.message === "object"
          ? (entry.message as Record<string, unknown>)
          : null;
      let text =
        typeof message?.content === "string"
          ? message.content
          : JSON.stringify(message?.content ?? entry, null, 2);
      const truncated = Buffer.byteLength(text) > 64 * 1024;
      if (truncated)
        text = Buffer.from(text)
          .subarray(0, 64 * 1024)
          .toString("utf8");
      size += Buffer.byteLength(text);
      if (size > 512 * 1024 && selected.length) break;
      selected.push({
        id: `${offset + index}:${String(entry.id ?? "")}`,
        type: String(entry.type ?? "record"),
        ...(typeof message?.role === "string" ? { role: message.role } : {}),
        text,
        truncated,
      });
    }
    const next = offset + selected.length;
    return {
      sessionId: run.sessionId!,
      archivedAt: file.created_at,
      entries: selected,
      nextCursor:
        next < entries.length
          ? Buffer.from(
              JSON.stringify({
                taskId,
                runId,
                sha256: file.sha256,
                offset: next,
              }),
            ).toString("base64url")
          : null,
      artifacts: this.metadata
        .artifacts(taskId, runId)
        .map((item) => ({ relativePath: item.relative_path, size: item.size })),
    };
  }
  async revealPath(taskId: string, runId: string, relativePath?: string) {
    const run = this.requireRun(taskId, runId);
    const root = await this.root();
    const artifact = relativePath
      ? this.metadata
          .artifacts(taskId, runId)
          .find((file) => file.relative_path === artifactPath(relativePath))
      : undefined;
    const file = relativePath
      ? artifact
      : run.sessionId
        ? this.metadata.session(taskId, run.sessionId)
        : undefined;
    if (!file) fail("TASK_ARCHIVE_MISSING", "Archived file was not found.");
    const target = relativePath
      ? path.join(root, taskId, "artifacts", runId, ...relativePath.split("/"))
      : this.sessionFile(root, taskId, run.sessionId!);
    await this.verify(root, target, file);
    return target;
  }
}
