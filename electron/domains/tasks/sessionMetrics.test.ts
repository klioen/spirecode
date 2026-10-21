import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { TaskRun } from "./types.js";
import {
  parseSessionTokenCount,
  taskRunDurationMs,
  TaskSessionMetricsReader,
} from "./sessionMetrics.js";

const directories: string[] = [];

afterEach(async () => {
  await Promise.all(
    directories
      .splice(0)
      .map((directory) => rm(directory, { force: true, recursive: true })),
  );
});

const run = (overrides: Partial<TaskRun> = {}): TaskRun => ({
  id: "run-1",
  taskId: "task-1",
  attempt: 1,
  status: "running",
  sagaPhase: "active",
  projectId: "project-1",
  worktreeId: "worktree-1",
  ownsManagedWorktree: true,
  worktreeName: "task-branch",
  baseRef: "origin/main",
  sessionId: "session-1",
  sessionPath: null,
  promptMarker: "marker",
  report: null,
  error: null,
  revision: 1,
  createdAt: 900,
  startedAt: 1_000,
  settledAt: null,
  reportedAt: null,
  finishedAt: null,
  ...overrides,
});

describe("task session metrics", () => {
  it("sums assistant usage while tolerating unrelated and partial JSONL entries", () => {
    const contents = [
      JSON.stringify({ type: "message", message: { role: "user" } }),
      JSON.stringify({
        type: "message",
        message: { role: "assistant", usage: { totalTokens: 120 } },
      }),
      JSON.stringify({
        type: "message",
        message: {
          role: "assistant",
          usage: { input: 10, output: 5, cacheRead: 20, cacheWrite: 2 },
        },
      }),
      JSON.stringify({ type: "usage", usage: { totalTokens: 3 } }),
      JSON.stringify({ type: "compaction", usage: { totalTokens: 4 } }),
      JSON.stringify({ type: "branch_summary", usage: { output: 5 } }),
      '{"type":"message"',
    ].join("\n");

    expect(parseSessionTokenCount(contents)).toBe(169);
  });

  it("reads and refreshes cached session usage while tolerating missing sessions", async () => {
    const directory = await mkdtemp(join(tmpdir(), "spire-task-metrics-"));
    directories.push(directory);
    const sessionPath = join(directory, "session.jsonl");
    await writeFile(
      sessionPath,
      JSON.stringify({
        type: "message",
        message: { role: "assistant", usage: { totalTokens: 321 } },
      }),
    );
    const reader = new TaskSessionMetricsReader();

    expect(await reader.tokenCount(sessionPath)).toBe(321);
    await writeFile(
      sessionPath,
      [
        JSON.stringify({
          type: "message",
          message: { role: "assistant", usage: { totalTokens: 321 } },
        }),
        JSON.stringify({
          type: "message",
          message: { role: "assistant", usage: { totalTokens: 9 } },
        }),
      ].join("\n"),
    );
    expect(await reader.tokenCount(sessionPath)).toBe(330);
    expect(await reader.tokenCount(join(directory, "missing.jsonl"))).toBe(0);
  });

  it("uses the correct wall-clock boundary for active and settled runs", () => {
    expect(taskRunDurationMs(run(), 4_000)).toBe(3_000);
    expect(
      taskRunDurationMs(
        run({ status: "awaiting_report", settledAt: 2_500 }),
        4_000,
      ),
    ).toBe(1_500);
    expect(
      taskRunDurationMs(run({ status: "reported", finishedAt: 3_000 }), 4_000),
    ).toBe(2_000);
    expect(taskRunDurationMs(run({ startedAt: null }), 4_000)).toBe(0);
  });
});
