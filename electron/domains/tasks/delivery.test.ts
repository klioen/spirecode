import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  parseOriginRemote,
  TaskDeliveryError,
  TaskDeliveryService,
  taskDeliveryBranch,
  taskDeliveryFailure,
  type ProviderRunner,
} from "./delivery.js";

const roots: string[] = [];

function git(cwd: string, ...args: string[]): string {
  return execFileSync("git", args, { cwd, encoding: "utf8" }).trim();
}

function repository(origin = "git@github.com:acme/widgets.git") {
  const root = mkdtempSync(join(tmpdir(), "spire-delivery-"));
  roots.push(root);
  git(root, "init", "--quiet", "--initial-branch=main");
  git(root, "config", "user.name", "Spire Test");
  git(root, "config", "user.email", "spire@example.test");
  writeFileSync(join(root, "README.md"), "start\n");
  git(root, "add", "-A");
  git(root, "commit", "--quiet", "-m", "initial");
  git(root, "remote", "add", "origin", origin);
  git(root, "update-ref", "refs/remotes/origin/main", "HEAD");
  git(
    root,
    "symbolic-ref",
    "refs/remotes/origin/HEAD",
    "refs/remotes/origin/main",
  );
  return root;
}

afterEach(() => {
  vi.restoreAllMocks();
  for (const root of roots.splice(0))
    rmSync(root, { recursive: true, force: true });
});

describe("read-only current commit verification snapshot", () => {
  it("reads the clean bound branch without staging, committing, or resetting", async () => {
    const root = repository();
    const delivery = new TaskDeliveryService(root);
    const start = await delivery.inspectStart({
      mode: "existing",
      branch: "main",
      baseRef: null,
      persistedTarget: null,
    });
    writeFileSync(join(root, "README.md"), "new\n");
    git(root, "add", "-A");
    git(root, "commit", "--quiet", "-m", "new");
    const head = git(root, "rev-parse", "HEAD");
    expect(await delivery.currentPrepared(start)).toEqual({
      head,
      changed: true,
    });
    expect(git(root, "rev-parse", "HEAD")).toBe(head);
    writeFileSync(join(root, "untracked.txt"), "dirty");
    await expect(delivery.currentPrepared(start)).rejects.toMatchObject({
      code: "TASK_DELIVERY_WORKTREE_NOT_CLEAN",
    });
    expect(git(root, "diff", "--cached", "--name-only")).toBe("");
    expect(git(root, "rev-parse", "HEAD")).toBe(head);
    git(root, "checkout", "-b", "another");
    await expect(delivery.currentPrepared(start)).rejects.toMatchObject({
      code: "TASK_DELIVERY_BRANCH_CONFLICT",
    });
  });
});

describe("origin parsing", () => {
  it.each([
    ["https://github.com/acme/widgets.git", "github", "acme/widgets"],
    ["git@github.com:acme/widgets.git", "github", "acme/widgets"],
    [
      "ssh://git@gitlab.com/acme/group/widgets.git",
      "gitlab",
      "acme/group/widgets",
    ],
  ])("parses %s", (origin, provider, project) => {
    expect(parseOriginRemote(origin)).toMatchObject({ provider, project });
  });

  it.each([
    "https://token@github.com/acme/widgets.git",
    "https://example.com/acme/widgets.git",
    "file:///tmp/repo",
  ])("rejects unsupported or credential-bearing origin %s", (origin) => {
    expect(() => parseOriginRemote(origin)).toThrow(TaskDeliveryError);
  });
});

describe("TaskDeliveryService", () => {
  it("retains safe Git failure phase/code/exit without recording sensitive stderr", () => {
    const raw = Object.assign(
      new Error("https://user:password@host/private?secret=hidden"),
      { code: "GIT_FAILED", details: { exitCode: "128" } },
    );
    const error = taskDeliveryFailure(raw, "delivery");
    expect(error).toMatchObject({
      code: "TASK_DELIVERY_GIT_FAILED",
      retryable: true,
    });
    expect(error.message).toContain("delivery failed (GIT_FAILED; exit 128)");
    expect(error.message).not.toContain("password");
    expect(error.message).not.toContain("hidden");
    expect(error.cause).toBe(raw);
  });

  it.each(["github", "gitlab"] as const)(
    "recovers an exact merged %s receipt without pushing or creating",
    async (provider) => {
      const root = repository(
        provider === "github"
          ? "git@github.com:acme/widgets.git"
          : "git@gitlab.com:acme/widgets.git",
      );
      const branch = "spire/task-merged";
      git(root, "switch", "-c", branch);
      const start = await new TaskDeliveryService(root).inspectStart({
        mode: "new_managed",
        branch,
        baseRef: "origin/main",
      });
      const head = git(root, "rev-parse", "HEAD");
      const item =
        provider === "github"
          ? {
              html_url: "https://github.com/acme/widgets/pull/16",
              draft: false,
              state: "closed",
              merged_at: "2026-10-24T00:00:00Z",
              head: {
                ref: branch,
                sha: head,
                repo: { full_name: "acme/widgets" },
              },
              base: { ref: "main" },
            }
          : {
              web_url: "https://gitlab.com/acme/widgets/-/merge_requests/16",
              draft: false,
              state: "merged",
              source_branch: branch,
              target_branch: "main",
              sha: head,
              source_project_id: 12,
              target_project_id: 12,
            };
      const runner: ProviderRunner = vi.fn(async (_executable, args) => {
        expect(args).not.toContain("POST");
        return { stdout: JSON.stringify([item]), exitCode: 0 };
      });
      const push = vi.fn(async () => undefined);
      const service = new TaskDeliveryService(root, {
        runProvider: runner,
        push,
      });
      await expect(service.findMergedDelivery(start)).resolves.toMatchObject({
        changed: true,
        head,
        changeRequest: { draft: false },
      });
      expect(push).not.toHaveBeenCalled();
      expect(runner).toHaveBeenCalledTimes(1);
      await expect(
        service.deliver({
          start,
          prepared: { head, changed: true },
          title: "Checked",
          summary: "Verified current SHA",
        }),
      ).resolves.toMatchObject({ head, changeRequest: { draft: false } });
      expect(push).not.toHaveBeenCalled();
    },
  );

  it.each([
    "open",
    "closed",
    "draft",
    "wrong-sha",
    "wrong-project",
    "wrong-branch",
    "wrong-base",
    "ambiguous",
  ])("rejects a %s receipt without remote effects", async (scenario) => {
    const root = repository();
    const branch = "spire/task-merged";
    git(root, "switch", "-c", branch);
    const start = await new TaskDeliveryService(root).inspectStart({
      mode: "new_managed",
      branch,
      baseRef: "origin/main",
    });
    const item = {
      html_url: "https://github.com/acme/widgets/pull/16",
      draft: scenario === "draft",
      state: scenario === "open" ? "open" : "closed",
      merged_at: scenario === "closed" ? null : "2026-10-24T00:00:00Z",
      head: {
        ref: scenario === "wrong-branch" ? "another" : branch,
        sha:
          scenario === "wrong-sha"
            ? "a".repeat(40)
            : git(root, "rev-parse", "HEAD"),
        repo: {
          full_name:
            scenario === "wrong-project" ? "evil/widgets" : "acme/widgets",
        },
      },
      base: { ref: scenario === "wrong-base" ? "another" : "main" },
    };
    const service = new TaskDeliveryService(root, {
      runProvider: async () => ({
        stdout: JSON.stringify(
          scenario === "ambiguous" ? [item, item] : [item],
        ),
        exitCode: 0,
      }),
    });
    await expect(service.findMergedDelivery(start)).resolves.toBeNull();
  });

  it("refuses a dirty local checkout before querying a merged PR", async () => {
    const root = repository();
    const start = await new TaskDeliveryService(root).inspectStart({
      mode: "new_managed",
      branch: "main",
      baseRef: "origin/main",
    });
    writeFileSync(join(root, "dirty.txt"), "do not discard");
    const runProvider = vi.fn();
    await expect(
      new TaskDeliveryService(root, { runProvider }).findMergedDelivery(start),
    ).rejects.toMatchObject({ code: "TASK_DELIVERY_WORKTREE_NOT_CLEAN" });
    expect(runProvider).not.toHaveBeenCalled();
  });

  it("does not push to a closed matching PR on an explicit delivery retry", async () => {
    const root = repository();
    const start = await new TaskDeliveryService(root).inspectStart({
      mode: "new_managed",
      branch: "main",
      baseRef: "origin/main",
    });
    writeFileSync(join(root, "feature.txt"), "implemented");
    const push = vi.fn(async () => undefined);
    const remoteBranchExists = vi.fn(async () => true);
    const service = new TaskDeliveryService(root, {
      push,
      remoteBranchExists,
      runProvider: async () => ({
        stdout: JSON.stringify([
          {
            html_url: "https://github.com/acme/widgets/pull/16",
            draft: false,
            state: "closed",
            head: { ref: "main" },
            base: { ref: "main" },
          },
        ]),
        exitCode: 0,
      }),
    });
    await expect(
      service.deliver({ start, title: "Implemented", summary: "Done" }),
    ).rejects.toMatchObject({ code: "TASK_DELIVERY_CHANGE_REQUEST_CLOSED" });
    expect(push).not.toHaveBeenCalled();
    expect(remoteBranchExists).not.toHaveBeenCalled();
  });

  it("selects an existing branch upstream before activating a unique task branch", async () => {
    const root = repository();
    git(root, "branch", "--set-upstream-to=origin/main", "main");
    const branch = taskDeliveryBranch("10000000-0000-4000-8000-000000000001");
    const updateBranch = vi.fn(async () => undefined);
    const service = new TaskDeliveryService(root, { updateBranch });

    const start = await service.inspectStart({ mode: "existing", branch });
    await service.activate(start);

    expect(start).toMatchObject({
      initialDirty: false,
      branch,
      target: "main",
    });
    expect(git(root, "branch", "--show-current")).toBe(branch);
    expect(updateBranch).toHaveBeenCalledWith(branch);
  });

  it("reports no delivery for a run with no commits or worktree changes", async () => {
    const root = repository();
    const service = new TaskDeliveryService(root);
    const start = await service.inspectStart({
      mode: "new_managed",
      branch: "main",
      baseRef: "origin/main",
    });

    await expect(
      service.deliver({ start, title: "No-op", summary: "No changes" }),
    ).resolves.toEqual({ changed: false, head: start.baselineHead });
  });

  it.each([
    [
      "github",
      "git@github.com:acme/widgets.git",
      "gh",
      "https://github.com/acme/widgets/pull/7",
    ],
    [
      "gitlab",
      "git@gitlab.com:acme/widgets.git",
      "glab",
      "https://gitlab.com/acme/widgets/-/merge_requests/7",
    ],
  ] as const)(
    "commits dirty changes, pushes, creates, and verifies a Ready %s change request",
    async (provider, origin, executable, url) => {
      const root = repository(origin);
      const branch = "spire/task-ready";
      git(root, "switch", "-c", branch);
      const serviceStart = new TaskDeliveryService(root);
      const start = await serviceStart.inspectStart({
        mode: "new_managed",
        branch,
        baseRef: "origin/main",
      });
      writeFileSync(join(root, "feature.ts"), "export const ready = true;\n");
      let created = false;
      const runner: ProviderRunner = vi.fn(async (actual, args) => {
        expect(actual).toBe(executable);
        if (args.includes("POST")) {
          created = true;
          return { stdout: "{}", exitCode: 0 };
        }
        const item =
          provider === "github"
            ? {
                html_url: url,
                draft: false,
                state: "open",
                head: { ref: branch },
                base: { ref: "main" },
              }
            : {
                web_url: url,
                draft: false,
                state: "opened",
                source_branch: branch,
                target_branch: "main",
              };
        return { stdout: JSON.stringify(created ? [item] : []), exitCode: 0 };
      });
      const push = vi.fn(async () => undefined);
      const service = new TaskDeliveryService(root, {
        runProvider: runner,
        remoteBranchExists: async () => false,
        push,
      });

      const result = await service.deliver({
        start,
        title: "Ready delivery",
        summary: "Implemented",
      });

      expect(result.changed).toBe(true);
      expect(result.changeRequest).toEqual({
        kind: provider === "github" ? "github_pr" : "gitlab_mr",
        url,
        draft: false,
      });
      expect(git(root, "status", "--porcelain")).toBe("");
      expect(git(root, "log", "-1", "--pretty=%s")).toBe(
        "Task: Ready delivery",
      );
      expect(push).toHaveBeenCalledWith(
        expect.objectContaining({ provider, project: "acme/widgets" }),
        branch,
      );
      expect(runner).toHaveBeenCalledWith(
        executable,
        expect.not.arrayContaining(["--draft"]),
      );
    },
  );

  it("adopts an exact Ready PR after a create/persist crash without creating a duplicate", async () => {
    const root = repository();
    const remote = mkdtempSync(join(tmpdir(), "spire-delivery-remote-"));
    roots.push(remote);
    git(remote, "init", "--bare", "--quiet");
    git(root, "remote", "set-url", "origin", remote);
    git(root, "switch", "-c", "spire/task-adopt");
    const start = await new TaskDeliveryService(root).inspectStart({
      mode: "new_managed",
      branch: "spire/task-adopt",
      baseRef: "origin/main",
    });
    writeFileSync(join(root, "adopt.txt"), "created before crash\n");
    git(root, "add", "-A");
    git(root, "commit", "--quiet", "-m", "agent commit");
    git(root, "remote", "set-url", "origin", "git@github.com:acme/widgets.git");
    const runner: ProviderRunner = vi.fn(async (_executable, args) => {
      expect(args).not.toContain("POST");
      return {
        exitCode: 0,
        stdout: JSON.stringify([
          {
            html_url: "https://github.com/acme/widgets/pull/10",
            draft: false,
            state: "open",
            head: { ref: "spire/task-adopt" },
            base: { ref: "main" },
          },
        ]),
      };
    });

    await expect(
      new TaskDeliveryService(root, {
        runProvider: runner,
        remoteBranchExists: async () => true,
        push: async () => undefined,
      }).deliver({
        start,
        title: "Adopt",
        summary: "Recover",
      }),
    ).resolves.toMatchObject({
      changed: true,
      changeRequest: { url: "https://github.com/acme/widgets/pull/10" },
    });
    expect(runner).toHaveBeenCalledTimes(2);
  });

  it("revalidates and carries forward the same Ready change request when a follow-up has no new Git changes", async () => {
    const root = repository();
    const remote = mkdtempSync(join(tmpdir(), "spire-delivery-remote-"));
    roots.push(remote);
    git(remote, "init", "--bare", "--quiet");
    git(root, "remote", "set-url", "origin", remote);
    git(root, "switch", "-c", "spire/task-follow-up");
    git(root, "push", "--quiet", "-u", "origin", "spire/task-follow-up");
    git(root, "remote", "set-url", "origin", "git@github.com:acme/widgets.git");
    const service = new TaskDeliveryService(root, {
      remoteBranchExists: async () => true,
      runProvider: async () => ({
        exitCode: 0,
        stdout: JSON.stringify([
          {
            html_url: "https://github.com/acme/widgets/pull/8",
            draft: false,
            state: "open",
            head: { ref: "spire/task-follow-up" },
            base: { ref: "main" },
          },
        ]),
      }),
    });
    const start = await service.inspectStart({
      mode: "new_managed",
      branch: "spire/task-follow-up",
      baseRef: "origin/main",
    });

    await expect(
      service.deliver({
        start,
        title: "Follow up",
        summary: "No further changes",
        priorChangeRequest: {
          kind: "github_pr",
          url: "https://github.com/acme/widgets/pull/8",
          draft: false,
        },
      }),
    ).resolves.toMatchObject({
      changed: false,
      changeRequest: {
        url: "https://github.com/acme/widgets/pull/8",
        draft: false,
      },
    });
  });

  it("fails closed before staging when repository filters or alternate push URLs are configured", async () => {
    const root = repository();
    git(root, "config", "filter.evil.clean", "touch should-not-run");
    writeFileSync(join(root, ".gitattributes"), "*.txt filter=evil\n");
    writeFileSync(join(root, "change.txt"), "change\n");
    const service = new TaskDeliveryService(root);
    const start = await service.inspectStart({
      mode: "new_managed",
      branch: "main",
      baseRef: "origin/main",
    });
    await expect(
      service.deliver({ start, title: "Unsafe", summary: "Unsafe" }),
    ).rejects.toMatchObject({ code: "TASK_DELIVERY_UNSAFE_GIT_CONFIG" });
    expect(existsSync(join(root, "should-not-run"))).toBe(false);

    git(root, "config", "--unset", "filter.evil.clean");
    writeFileSync(join(root, ".gitattributes"), "");
    git(
      root,
      "config",
      "remote.origin.pushurl",
      "git@github.com:other/leak.git",
    );
    await expect(
      service.deliver({ start, title: "Unsafe", summary: "Unsafe" }),
    ).rejects.toMatchObject({ code: "TASK_DELIVERY_UNSAFE_GIT_CONFIG" });
  });

  it("refuses to reuse a Draft or closed change request", async () => {
    const root = repository();
    const remote = mkdtempSync(join(tmpdir(), "spire-delivery-remote-"));
    roots.push(remote);
    git(remote, "init", "--bare", "--quiet");
    git(root, "remote", "set-url", "origin", remote);
    git(root, "switch", "-c", "spire/task-reuse");
    const start = await new TaskDeliveryService(root).inspectStart({
      mode: "new_managed",
      branch: "spire/task-reuse",
      baseRef: "origin/main",
    });
    writeFileSync(join(root, "change.txt"), "change\n");
    git(root, "add", "-A");
    git(root, "commit", "--quiet", "-m", "agent commit");
    git(root, "push", "--quiet", "-u", "origin", "spire/task-reuse");
    git(root, "remote", "set-url", "origin", "git@github.com:acme/widgets.git");
    const runner: ProviderRunner = async () => ({
      exitCode: 0,
      stdout: JSON.stringify([
        {
          html_url: "https://github.com/acme/widgets/pull/9",
          draft: true,
          state: "open",
          head: { ref: "spire/task-reuse" },
          base: { ref: "main" },
        },
      ]),
    });

    await expect(
      new TaskDeliveryService(root, {
        runProvider: runner,
        remoteBranchExists: async () => true,
        push: async () => undefined,
      }).deliver({
        start,
        title: "Reuse",
        summary: "More work",
        priorChangeRequest: {
          kind: "github_pr",
          url: "https://github.com/acme/widgets/pull/9",
          draft: false,
        },
      }),
    ).rejects.toMatchObject({ code: "TASK_DELIVERY_CHANGE_REQUEST_DRAFT" });
  });
});
