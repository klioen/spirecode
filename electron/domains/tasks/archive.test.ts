// @vitest-environment node
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, expect, it, vi, type Mock } from "vitest";
import { openTaskDatabase, type TaskDatabase } from "./database.js";
import { TaskRepository } from "./repository.js";
import {
  TaskArchiveService,
  type TaskArchiveOptions,
  discoverTaskSessions,
} from "./archive.js";

const taskId = "10000000-0000-4000-8000-000000000001";
const runId = "20000000-0000-4000-8000-000000000001";
const sessionId = "30000000-0000-4000-8000-000000000001";
const worktreeId = "40000000-0000-4000-8000-000000000001";
let directory: string;
let data: string;
let sdk: string;
let workspace: string;
let source: string;
let database: TaskDatabase;
let tasks: TaskRepository;
let archive: TaskArchiveService;
let now: number;
let resolveSessions: Mock<TaskArchiveOptions["resolveSessions"]>;
function sessionText(id = sessionId) {
  return (
    [
      { type: "session", id, cwd: workspace, version: 3 },
      {
        type: "message",
        id: "user",
        timestamp: now,
        message: { role: "user", content: "marker-first" },
      },
      {
        type: "message",
        id: "assistant",
        timestamp: now + 1,
        message: {
          role: "assistant",
          content: "Done",
          usage: { totalTokens: 123 },
        },
      },
      {
        type: "message",
        id: "tool",
        timestamp: now + 2,
        message: {
          role: "toolResult",
          content: [{ type: "text", text: "Tests passed" }],
        },
      },
    ]
      .map((value) => JSON.stringify(value))
      .join("\n") + "\n"
  );
}
beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), "spire-archive-"));
  data = join(directory, "data");
  sdk = join(directory, "sdk");
  workspace = join(directory, "worktree");
  for (const dir of [data, sdk, workspace]) mkdirSync(dir);
  source = join(sdk, `${sessionId}.jsonl`);
  now = 1700000000000;
  database = openTaskDatabase(join(data, "tasks.sqlite3"));
  tasks = new TaskRepository(database.connection, { now: () => now });
  tasks.createTask({
    id: taskId,
    title: "Archive",
    description: "",
    projectId: worktreeId,
    workspace: { mode: "new_managed", baseRef: "origin/main" },
    automationEnabled: false,
  });
  let run = tasks.createRun(taskId, 1, {
    id: runId,
    projectId: worktreeId,
    promptMarker: "marker-first",
    ownsManagedWorktree: true,
    worktreeName: "archive",
    baseRef: "origin/main",
    sessionId,
  }).run;
  run = tasks.bindRunWorkspace(run.id, run.revision, worktreeId);
  run = tasks.transitionRun(run.id, run.revision, "provisioning", {
    taskStatus: "running",
  }).run;
  run = tasks.transitionRun(run.id, run.revision, "prompting").run;
  run = tasks.transitionRun(run.id, run.revision, "running").run;
  run = tasks.reportRun(run.id, run.revision, {
    outcome: "success",
    summary: "Retained report",
    tests: [],
  }).run;
  tasks.finalizeRunReport(run.id, run.revision, now + 10);
  database.connection
    .prepare("UPDATE task_runs SET finished_at=? WHERE id=?")
    .run(now + 10, run.id);
  const task = tasks.getTask(taskId)!;
  tasks.completeTask(taskId, task.revision);
  writeFileSync(source, sessionText());
  resolveSessions = vi.fn<TaskArchiveOptions["resolveSessions"]>(
    async () => new Map([[sessionId, source]]),
  );
  archive = new TaskArchiveService(tasks, {
    dataDirectory: data,
    sessionRoot: sdk,
    workspaceRoot: async () => workspace,
    resolveSessions,
  });
});
afterEach(() => {
  database.close();
  rmSync(directory, { recursive: true, force: true });
});

it("backfills the persisted path and freezes terminal metrics without modifying the source", async () => {
  expect(tasks.getRun(runId)?.sessionPath).toBeNull();
  await archive.finalize(runId);
  expect(tasks.getRun(runId)?.sessionPath).toBe(source);
  expect(archive.metadata.retention(runId)).toMatchObject({
    token_count: 123,
    duration_ms: 10,
  });
  expect(readFileSync(source, "utf8")).toBe(sessionText());
});
it("keeps verified paged history, artifacts, report and metrics after workspace/source removal and restart", async () => {
  writeFileSync(join(workspace, "report.txt"), "test evidence");
  await archive.archive(taskId, [{ runId, relativePath: "report.txt" }]);
  const original = readFileSync(source);
  rmSync(workspace, { recursive: true });
  rmSync(source);
  const task = tasks.getTask(taskId)!;
  const intent = tasks.beginWorkspaceCleanup(taskId, task.revision);
  tasks.finishWorkspaceCleanup(taskId, intent.revision);
  database.close();
  database = openTaskDatabase(join(data, "tasks.sqlite3"));
  tasks = new TaskRepository(database.connection);
  archive = new TaskArchiveService(tasks, {
    dataDirectory: data,
    sessionRoot: sdk,
    workspaceRoot: async () => {
      throw new Error("deleted");
    },
    resolveSessions: async () => new Map(),
  });
  await archive.archive(taskId);
  const first = await archive.read(taskId, runId, 1);
  const second = await archive.read(taskId, runId, 2, first.nextCursor!);
  expect(first.entries[0].text).toBe("marker-first");
  expect(second.entries[0].text).toBe("Done");
  expect(second.nextCursor).toBeNull();
  expect(tasks.getRun(runId)?.report?.summary).toBe("Retained report");
  expect(archive.metadata.retention(runId)).toMatchObject({
    token_count: 123,
    duration_ms: 10,
    archive_kind: "archived",
  });
  expect(readFileSync(await archive.revealPath(taskId, runId))).toEqual(
    original,
  );
  expect(
    readFileSync(await archive.revealPath(taskId, runId, "report.txt"), "utf8"),
  ).toBe("test evidence");
});
it("rejects corrupt archive copies without deleting originals or hiding stored reports", async () => {
  await archive.archive(taskId);
  writeFileSync(await archive.revealPath(taskId, runId), "corrupt");
  await expect(archive.archive(taskId)).rejects.toMatchObject({
    code: "TASK_ARCHIVE_CORRUPT",
  });
  expect(archive.metadata.state(taskId)?.status).toBe("failed");
  expect(readFileSync(source, "utf8")).toBe(sessionText());
  expect(tasks.getRun(runId)?.report).not.toBeNull();
});
it("fails closed when a reported session is missing or has a foreign identity", async () => {
  resolveSessions.mockResolvedValue(new Map());
  await expect(archive.archive(taskId)).rejects.toMatchObject({
    code: "TASK_ARCHIVE_MISSING",
  });
  resolveSessions.mockResolvedValue(new Map([[sessionId, source]]));
  writeFileSync(source, sessionText(worktreeId));
  await expect(archive.archive(taskId)).rejects.toMatchObject({
    code: "TASK_ARCHIVE_UNSAFE",
  });
});
it("rejects symlink source, archive directories, traversal and unindexed artifact reveals", async () => {
  const outside = join(directory, "outside.jsonl");
  writeFileSync(outside, sessionText());
  rmSync(source);
  symlinkSync(outside, source);
  await expect(archive.archive(taskId)).rejects.toMatchObject({
    code: "TASK_ARCHIVE_UNSAFE",
  });
  rmSync(source);
  writeFileSync(source, sessionText());
  await expect(
    archive.archive(taskId, [{ runId, relativePath: "../outside.jsonl" }]),
  ).rejects.toMatchObject({ code: "TASK_ARCHIVE_INVALID" });
  const root = await archive.root();
  symlinkSync(workspace, join(root, taskId));
  await expect(archive.archive(taskId)).rejects.toMatchObject({
    code: "TASK_ARCHIVE_UNSAFE",
  });
  unlinkSync(join(root, taskId));
  await archive.archive(taskId);
  await expect(
    archive.revealPath(taskId, runId, "not-indexed.txt"),
  ).rejects.toMatchObject({ code: "TASK_ARCHIVE_MISSING" });
});
it("persists artifact selection through failures and recovers an interrupted archive intent", async () => {
  await expect(
    archive.archive(taskId, [{ runId, relativePath: "later.txt" }]),
  ).rejects.toMatchObject({ code: "TASK_ARCHIVE_FAILED" });
  writeFileSync(join(workspace, "later.txt"), "evidence");
  archive.metadata.setState(taskId, "intent");
  await archive.recover();
  expect(archive.metadata.state(taskId)?.status).toBe("ready");
  expect(
    readFileSync(await archive.revealPath(taskId, runId, "later.txt"), "utf8"),
  ).toBe("evidence");
});
it("deduplicates shared sessions across runs and preserves per-run token windows", async () => {
  const nextId = "20000000-0000-4000-8000-000000000002";
  database.connection
    .prepare("UPDATE tasks SET status='needs_review' WHERE id=?")
    .run(taskId);
  now += 100;
  let run = tasks.createRun(taskId, tasks.getTask(taskId)!.revision, {
    id: nextId,
    projectId: worktreeId,
    promptMarker: "marker-second",
    ownsManagedWorktree: true,
    worktreeId,
    sessionId,
  }).run;
  run = tasks.transitionRun(run.id, run.revision, "provisioning", {
    taskStatus: "running",
  }).run;
  run = tasks.transitionRun(run.id, run.revision, "prompting").run;
  run = tasks.transitionRun(run.id, run.revision, "running").run;
  run = tasks.reportRun(run.id, run.revision, {
    outcome: "success",
    summary: "Follow up",
    tests: [],
  }).run;
  tasks.finalizeRunReport(run.id, run.revision, now + 10);
  database.connection
    .prepare("UPDATE task_runs SET finished_at=? WHERE id=?")
    .run(now + 10, run.id);
  tasks.completeTask(taskId, tasks.getTask(taskId)!.revision);
  const content =
    readFileSync(source, "utf8") +
    JSON.stringify({
      type: "message",
      timestamp: now + 1,
      message: { role: "user", content: "marker-second" },
    }) +
    "\n" +
    JSON.stringify({
      type: "message",
      timestamp: now + 2,
      message: {
        role: "assistant",
        content: "More",
        usage: { totalTokens: 50 },
      },
    }) +
    "\n";
  writeFileSync(source, content);
  await archive.archive(taskId);
  expect(readdirSync(join(await archive.root(), taskId, "sessions"))).toEqual([
    `${sessionId}.jsonl`,
  ]);
  expect(archive.metadata.retention(runId)?.token_count).toBe(123);
  expect(archive.metadata.retention(nextId)?.token_count).toBe(50);
  const page = await archive.read(taskId, runId, 1);
  await expect(
    archive.read(taskId, nextId, 1, page.nextCursor!),
  ).rejects.toMatchObject({ code: "TASK_ARCHIVE_INVALID" });
});
it("rejects oversized selections, malformed cursors and cross-task run access", async () => {
  await expect(
    archive.archive(
      taskId,
      Array.from({ length: 21 }, (_, i) => ({
        runId,
        relativePath: `file${i}`,
      })),
    ),
  ).rejects.toMatchObject({ code: "TASK_ARCHIVE_LIMIT" });
  await archive.archive(taskId);
  await expect(archive.read(worktreeId, runId, 1)).rejects.toMatchObject({
    code: "TASK_NOT_FOUND",
  });
  await expect(archive.read(taskId, runId, 21)).rejects.toMatchObject({
    code: "TASK_ARCHIVE_INVALID",
  });
  await expect(archive.read(taskId, runId, 1, "invalid")).rejects.toMatchObject(
    { code: "TASK_ARCHIVE_INVALID" },
  );
});

it("recovers a copied session whose metadata commit was interrupted", async () => {
  const save = vi
    .spyOn(archive.metadata, "saveSession")
    .mockImplementationOnce(() => {
      throw new Error("interrupted index commit");
    });
  await expect(archive.archive(taskId)).rejects.toMatchObject({
    code: "TASK_ARCHIVE_FAILED",
  });
  expect(archive.metadata.session(taskId, sessionId)).toBeUndefined();
  expect(readFileSync(source, "utf8")).toContain("marker-first");
  save.mockRestore();
  archive.metadata.setState(taskId, "intent");
  await archive.recover();
  expect(archive.metadata.state(taskId)?.status).toBe("ready");
  expect((await archive.read(taskId, runId, 20)).entries).toHaveLength(3);
});
it("marks unpersisted empty failed runs explicitly rather than inventing missing history", async () => {
  const task = tasks.createTask({
    id: worktreeId,
    title: "Empty",
    description: "",
    projectId: worktreeId,
    workspace: { mode: "new_managed", baseRef: "origin/main" },
    automationEnabled: false,
  });
  const run = tasks.createRun(task.id, task.revision, {
    id: sessionId,
    projectId: worktreeId,
    promptMarker: "empty",
    ownsManagedWorktree: true,
    sessionId: worktreeId,
  }).run;
  tasks.cancelRun(run.id, run.revision);
  await archive.archive(task.id);
  expect(archive.metadata.retention(run.id)).toMatchObject({
    archive_kind: "empty",
    token_count: 0,
    duration_ms: 0,
  });
});
it("includes the terminal millisecond in the frozen token window", async () => {
  database.connection
    .prepare("UPDATE task_runs SET finished_at=? WHERE id=?")
    .run(now + 1, runId);
  await archive.finalize(runId);
  expect(archive.metadata.retention(runId)?.token_count).toBe(123);
});

it("discovers retained files without a live worktree and rejects duplicate UUID files", async () => {
  const found = await discoverTaskSessions(sdk, [sessionId]);
  expect(found.get(sessionId)).toBeDefined();
  mkdirSync(join(sdk, "encoded-worktree"));
  writeFileSync(
    join(sdk, "encoded-worktree", `timestamp_${sessionId}.jsonl`),
    sessionText(),
  );
  await expect(discoverTaskSessions(sdk, [sessionId])).rejects.toMatchObject({
    code: "TASK_ARCHIVE_UNSAFE",
  });
  rmSync(join(sdk, "encoded-worktree"), { recursive: true });
  const other = join(directory, "foreign");
  mkdirSync(other);
  writeFileSync(
    join(other, `timestamp_${worktreeId}.jsonl`),
    sessionText(worktreeId),
  );
  symlinkSync(other, join(sdk, "link"));
  expect((await discoverTaskSessions(sdk, [worktreeId])).size).toBe(0);
});

it("refuses partial JSONL and invalid UTF-8 rather than silently losing final records", async () => {
  writeFileSync(source, sessionText() + '{"type":');
  await expect(archive.archive(taskId)).rejects.toMatchObject({
    code: "TASK_ARCHIVE_CORRUPT",
  });
  writeFileSync(
    source,
    Buffer.concat([Buffer.from(sessionText()), Buffer.from([0xff])]),
  );
  await expect(archive.archive(taskId)).rejects.toMatchObject({
    code: "TASK_ARCHIVE_CORRUPT",
  });
  expect(archive.metadata.session(taskId, sessionId)).toBeUndefined();
});
it("retains oversized original files and rejects unsafe artifact aliases", async () => {
  writeFileSync(
    join(workspace, "large.bin"),
    Buffer.alloc(10 * 1024 * 1024 + 1),
  );
  await expect(
    archive.archive(taskId, [{ runId, relativePath: "large.bin" }]),
  ).rejects.toMatchObject({ code: "TASK_ARCHIVE_LIMIT" });
  expect(readFileSync(join(workspace, "large.bin")).length).toBe(
    10 * 1024 * 1024 + 1,
  );
  for (const relativePath of [".GIT/config", "file.", "file "])
    await expect(
      archive.archive(taskId, [{ runId, relativePath }]),
    ).rejects.toMatchObject({ code: "TASK_ARCHIVE_INVALID" });
  await expect(
    archive.archive(taskId, [
      { runId, relativePath: "Report.txt" },
      { runId, relativePath: "report.txt" },
    ]),
  ).rejects.toMatchObject({ code: "TASK_ARCHIVE_INVALID" });
});
