// @vitest-environment node
import { execFileSync } from "node:child_process";
import { mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TaskIntakeService, isTaskIntakeConfirmation } from "./intake.js";
import type { ChatSessionInternalOptions } from "../chat/chatService.js";
import type { CreateTaskRequest, TaskDetail } from "./service.js";

const projectId = "90000000-0000-4000-8000-000000000001";
const worktreeId = "90000000-0000-4000-8000-000000000002";
const directories: string[] = [];
const services: TaskIntakeService[] = [];
afterEach(async () => {
  await Promise.all(services.splice(0).map((service) => service.dispose()));
  await Promise.all(
    directories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

async function fixture() {
  const root = await mkdtemp(path.join(os.tmpdir(), "spire-intake-"));
  directories.push(root);
  const configDirectory = await mkdtemp(
    path.join(os.tmpdir(), "spire-intake-git-config-"),
  );
  directories.push(configDirectory);
  const globalConfig = path.join(configDirectory, "global.gitconfig");
  await writeFile(globalConfig, "");
  const git = (...args: string[]) =>
    execFileSync("git", args, {
      cwd: root,
      encoding: "utf8",
      env: {
        ...process.env,
        GIT_CONFIG_NOSYSTEM: "1",
        GIT_CONFIG_GLOBAL: globalConfig,
      },
    }).trim();
  git("init", "-b", "main");
  git("config", "user.name", "Test");
  git("config", "user.email", "test@example.invalid");
  await writeFile(path.join(root, "app.ts"), "export const answer = 42;\n");
  await symlink("app.ts", path.join(root, "linked.ts"));
  git("add", ".");
  git("commit", "-m", "baseline");
  git("update-ref", "refs/remotes/origin/main", "HEAD");
  const commit = git("rev-parse", "HEAD");
  const tasks = new Map<string, TaskDetail>();
  const taskCreate = vi.fn(async (input: CreateTaskRequest, id?: string) => {
    const taskId = id!;
    if (!tasks.has(taskId))
      tasks.set(taskId, {
        task: { id: taskId, title: input.title, status: "queued" },
      } as TaskDetail);
    return tasks.get(taskId)!;
  });
  const context = vi.fn(async () => ({
    root,
    projectId,
    projectName: "Test project",
    kind: "git" as const,
  }));
  const onChanged = vi.fn();
  const dependencies = {
    chat: {
      create: vi.fn(
        async (
          _worktreeId: string,
          options: ChatSessionInternalOptions = {},
        ) => ({
          sessionId: options.sessionId!,
          worktreeId,
          title: "",
          createdAt: 1,
          updatedAt: 1,
        }),
      ),
    },
    tasks: {
      create: taskCreate,
      get: vi.fn(async (id: string) => {
        const detail = tasks.get(id);
        if (!detail)
          throw Object.assign(new Error("missing"), { code: "TASK_NOT_FOUND" });
        return detail;
      }),
    },
    context,
    branches: vi.fn(async () => ({
      defaultRef: "origin/main",
      branches: [{ ref: "origin/main" }],
    })),
    onChanged,
  };
  const directory = path.join(root, "intakes");
  const service = new TaskIntakeService(directory, dependencies);
  services.push(service);
  await service.initialize();
  const summary = await service.create(worktreeId);
  const options = () => service.sessionOptions(worktreeId, summary.sessionId)!;
  type TestTool = {
    name: string;
    execute(
      id: string,
      params: unknown,
      signal?: AbortSignal,
    ): Promise<{ content: Array<{ text: string }>; isError?: boolean }>;
  };
  const call = (name: string, params: unknown, signal?: AbortSignal) => {
    const item = (options().customTools as TestTool[]).find(
      (item) => item.name === name,
    )!;
    return item.execute("call-1", params, signal);
  };
  const prepare = async () => {
    await options().onSend!("Implement answer formatting");
    const result = await call("prepare_task", {
      title: "Format answer",
      description:
        "Goal: format answers. Scope: app.ts. Acceptance: tests pass. Do not change APIs.",
    });
    expect(result.isError).toBeUndefined();
    return (await service.get(worktreeId, summary.sessionId)).proposal!;
  };
  return {
    service,
    summary,
    options,
    call,
    prepare,
    dependencies,
    taskCreate,
    tasks,
    root,
    directory,
    git,
    commit,
  };
}

describe("Task intake consent", () => {
  it.each(["确认", "开始", "确认提交！", "yes", "confirm", "start", "submit"])(
    "accepts explicit confirmation %s",
    (text) => {
      expect(isTaskIntakeConfirmation(text)).toBe(true);
    },
  );
  it.each([
    "",
    "looks good but change X",
    "确认，但不要修改 API",
    "不要开始",
    "maybe",
    "what happens if I say yes?",
    "yes?",
    "yes/no",
  ])("rejects ambiguous/modifying reply %s", (text) => {
    expect(isTaskIntakeConfirmation(text)).toBe(false);
  });
  it("requires a later user confirmation of the exact host proposal", async () => {
    const value = await fixture();
    expect(value.summary.kind).toBe("task-intake");
    expect(value.options().readOnly).toBe(true);
    expect(value.options().restoreEmpty).toBe(true);
    const proposal = await value.prepare();
    expect(value.options().restoreEmpty).toBe(false);
    expect(proposal.description).toContain(value.commit);
    expect(proposal.description).toContain("Acceptance: tests pass");
    expect(
      (await value.call("submit_task", { reviewId: proposal.reviewId }))
        .isError,
    ).toBe(true);
    expect(value.taskCreate).not.toHaveBeenCalled();
    await value.options().onSend!("确认提交");
    expect(
      (await value.call("submit_task", { reviewId: "another-review" })).isError,
    ).toBe(true);
    expect(
      (
        await value.call("submit_task", {
          reviewId: proposal.reviewId,
          title: "replacement",
        })
      ).isError,
    ).toBe(true);
    expect(
      (await value.call("submit_task", { reviewId: proposal.reviewId }))
        .isError,
    ).toBeUndefined();
    expect(value.taskCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        projectId,
        automationEnabled: true,
        workspace: { mode: "new_managed", baseRef: "origin/main" },
        description: proposal.description,
      }),
      expect.any(String),
    );
    const snapshot = await value.service.get(
      worktreeId,
      value.summary.sessionId,
    );
    expect(snapshot.phase).toBe("submitted");
    expect(snapshot.task?.status).toBe("queued");
    expect(
      value.service.executionCommit(snapshot.task!.id, "origin/main"),
    ).toBe(value.commit);
    await expect(value.options().onSend!("Start another task")).rejects.toThrow(
      "already been submitted",
    );
  });
  it("invalidates a proposal on changing reply and requires a fresh confirmation after replacement", async () => {
    const value = await fixture();
    const original = await value.prepare();
    await value.options().onSend!("确认，但不要修改 API");
    expect(
      (await value.service.get(worktreeId, value.summary.sessionId)).proposal,
    ).toBeNull();
    expect(
      (await value.call("submit_task", { reviewId: original.reviewId }))
        .isError,
    ).toBe(true);
    await value.call("prepare_task", {
      title: "Revised",
      description: "Acceptance: preserve API and pass tests.",
    });
    const revised = (
      await value.service.get(worktreeId, value.summary.sessionId)
    ).proposal!;
    expect(
      (await value.call("submit_task", { reviewId: revised.reviewId })).isError,
    ).toBe(true);
    await value.options().onSend!("开始");
    await value.call("submit_task", { reviewId: revised.reviewId });
    expect(value.taskCreate).toHaveBeenCalledTimes(1);
  });
  it("deduplicates concurrent tool calls and keeps authorization/restrictions after restart", async () => {
    const value = await fixture();
    const proposal = await value.prepare();
    await value.options().onSend!("确认");
    await Promise.all([
      value.call("submit_task", { reviewId: proposal.reviewId }),
      value.call("submit_task", { reviewId: proposal.reviewId }),
    ]);
    expect(value.taskCreate).toHaveBeenCalledTimes(1);
    const restored = new TaskIntakeService(value.directory, value.dependencies);
    services.push(restored);
    await restored.initialize();
    expect(
      restored.sessionOptions(worktreeId, value.summary.sessionId)?.readOnly,
    ).toBe(true);
    const snapshot = await restored.get(worktreeId, value.summary.sessionId);
    expect(snapshot.phase).toBe("submitted");
    expect(value.tasks.size).toBe(1);
    expect(restored.executionCommit(snapshot.task!.id, "origin/main")).toBe(
      value.commit,
    );
    expect(() =>
      restored.sessionOptions("another-worktree", value.summary.sessionId),
    ).toThrow();
    await expect(
      restored.get("another-worktree", value.summary.sessionId),
    ).rejects.toThrow();
  });
  it("recovers a crash after atomic Task creation but before intake submission is finalized", async () => {
    const value = await fixture();
    const proposal = await value.prepare();
    await value.options().onSend!("yes");
    const original = value.taskCreate.getMockImplementation()!;
    value.taskCreate.mockImplementationOnce(async (...args) => {
      await original(...args);
      throw new Error("Interrupted after Task commit");
    });
    expect(
      (await value.call("submit_task", { reviewId: proposal.reviewId }))
        .isError,
    ).toBe(true);
    const snapshot = await value.service.get(
      worktreeId,
      value.summary.sessionId,
    );
    expect(snapshot.phase).toBe("submitted");
    expect(snapshot.task).not.toBeNull();
    const restored = new TaskIntakeService(value.directory, value.dependencies);
    services.push(restored);
    await restored.initialize();
    const tools = restored.sessionOptions(worktreeId, value.summary.sessionId)!
      .customTools as Array<{
      name: string;
      execute(id: string, params: unknown): Promise<unknown>;
    }>;
    await tools
      .find((item) => item.name === "submit_task")!
      .execute("retry", { reviewId: proposal.reviewId });
    expect(value.tasks.size).toBe(1);
    expect(
      (await restored.get(worktreeId, value.summary.sessionId)).task?.id,
    ).toBe(snapshot.task!.id);
  });
  it("revokes consent if the origin baseline changes before submission", async () => {
    const value = await fixture();
    const proposal = await value.prepare();
    await value.options().onSend!("yes");
    await writeFile(
      path.join(value.root, "app.ts"),
      "export const answer = 43;\n",
    );
    value.git("add", "app.ts");
    value.git("commit", "-m", "updated baseline");
    value.git("update-ref", "refs/remotes/origin/main", "HEAD");
    expect(
      (await value.call("submit_task", { reviewId: proposal.reviewId }))
        .isError,
    ).toBe(true);
    expect(value.taskCreate).not.toHaveBeenCalled();
    expect(
      (await value.service.get(worktreeId, value.summary.sessionId)).proposal,
    ).toBeNull();
    await value.call("select_task_base", { baseRef: "origin/main" });
    expect(
      (await value.service.get(worktreeId, value.summary.sessionId)).baseCommit,
    ).not.toBe(value.commit);
  });
  it("does not submit an aborted tool call or allow user-supplied paths/projects in submission", async () => {
    const value = await fixture();
    const proposal = await value.prepare();
    await value.options().onSend!("yes");
    const controller = new AbortController();
    controller.abort();
    expect(
      (
        await value.call(
          "submit_task",
          { reviewId: proposal.reviewId },
          controller.signal,
        )
      ).isError,
    ).toBe(true);
    expect(
      (
        await value.call("submit_task", {
          reviewId: proposal.reviewId,
          projectId: "/tmp",
        })
      ).isError,
    ).toBe(true);
    expect(value.taskCreate).not.toHaveBeenCalled();
    await value.service.dispose();
    expect(
      (await value.call("submit_task", { reviewId: proposal.reviewId }))
        .isError,
    ).toBe(true);
  });
});

describe("Task intake read-only baseline", () => {
  it("reads committed objects rather than live edits and excludes symlinks/traversal", async () => {
    const value = await fixture();
    await writeFile(path.join(value.root, "app.ts"), "uncommitted SECRET\n");
    const files = JSON.parse(
      (await value.call("list_task_files", { prefix: "" })).content[0].text,
    );
    expect(files.files).toEqual(["app.ts"]);
    const file = JSON.parse(
      (await value.call("read_task_file", { relativePath: "app.ts" }))
        .content[0].text,
    );
    expect(file.content).toBe("export const answer = 42;\n");
    for (const relativePath of [
      "linked.ts",
      "../app.ts",
      "/etc/passwd",
      "C:\\private",
      "app.ts\0",
    ]) {
      expect(
        (await value.call("read_task_file", { relativePath })).isError,
      ).toBe(true);
    }
    const search = JSON.parse(
      (await value.call("search_task_code", { query: "answer", prefix: "" }))
        .content[0].text,
    );
    expect(search.matches[0]).toMatchObject({ path: "app.ts", line: 1 });
    expect(
      (await value.call("select_task_base", { baseRef: "main" })).isError,
    ).toBe(true);
    expect(
      (await value.call("select_task_base", { baseRef: "origin/unknown" }))
        .isError,
    ).toBe(true);
    expect(
      (value.options().customTools as Array<{ name: string }>).map(
        (item) => item.name,
      ),
    ).not.toEqual(expect.arrayContaining(["bash", "edit", "write", "read"]));
  });
  it("persists metadata before Pi creation and fails closed on corrupted records", async () => {
    const value = await fixture();
    const metadataPath = path.join(
      value.directory,
      `${value.summary.sessionId}.json`,
    );
    const record = JSON.parse(await readFile(metadataPath, "utf8"));
    expect(record.sessionId).toBe(value.summary.sessionId);
    await writeFile(metadataPath, "{}");
    const restored = new TaskIntakeService(value.directory, value.dependencies);
    services.push(restored);
    await expect(restored.initialize()).rejects.toThrow(
      "Corrupt task intake identity",
    );
    expect(() =>
      restored.sessionOptions(worktreeId, value.summary.sessionId),
    ).toThrow("metadata is unavailable");
  });
  it("does not create an intake without a valid origin baseline", async () => {
    const value = await fixture();
    value.dependencies.branches.mockResolvedValueOnce({
      defaultRef: null,
      branches: [],
    } as unknown as Awaited<ReturnType<typeof value.dependencies.branches>>);
    await expect(value.service.create(worktreeId)).rejects.toThrow(
      "origin default branch",
    );
  });
});
