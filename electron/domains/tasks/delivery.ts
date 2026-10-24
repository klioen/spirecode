import { spawn } from "node:child_process";
import {
  assertNoRepositoryGitCommands,
  gitText,
  runGit,
} from "../../core/gitProcess.js";
import type { TaskRunReport } from "./types.js";
import { withGitAskpass } from "./gitAskpass.js";
import { findProviderExecutable } from "./providerExecutable.js";

const MAX_OUTPUT = 1024 * 1024;
const PROVIDER_TIMEOUT_MS = 30_000;
const BRANCH_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._/-]{0,199}$/u;

export type ChangeRequest = NonNullable<TaskRunReport["changeRequest"]>;
export type DeliveryProvider = "github" | "gitlab";

export interface GitDeliveryStart {
  baselineHead: string;
  initialDirty: boolean;
  branch: string;
  target: string;
}

export interface GitPreparationResult {
  changed: boolean;
  head: string;
}

export interface GitDeliveryResult extends GitPreparationResult {
  changeRequest?: ChangeRequest;
}

export class TaskDeliveryError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly retryable: boolean,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "TaskDeliveryError";
  }
}

interface ProcessResult {
  stdout: string;
  exitCode: number;
}

export type ProviderRunner = (
  executable: "gh" | "glab",
  args: readonly string[],
) => Promise<ProcessResult>;

export interface DeliveryServiceOptions {
  runProvider?: ProviderRunner;
  updateBranch?: (branch: string) => Promise<void>;
  remoteBranchExists?: (
    remote: { provider: DeliveryProvider; host: string; project: string },
    branch: string,
  ) => Promise<boolean>;
  push?: (
    remote: { provider: DeliveryProvider; host: string; project: string },
    branch: string,
  ) => Promise<void>;
}

interface RemoteRepository {
  provider: DeliveryProvider;
  host: string;
  project: string;
  owner: string;
  transport: "https" | "ssh";
}

interface RemoteChangeRequest {
  url: string;
  draft: boolean;
  state: string;
  head: string;
  base: string;
  headSha?: string;
  sourceProject?: string;
  merged?: boolean;
}

function safeProviderEnvironment(executable: "gh" | "glab"): NodeJS.ProcessEnv {
  const allowed = [
    "PATH",
    "HOME",
    "USERPROFILE",
    "XDG_CONFIG_HOME",
    "GH_CONFIG_DIR",
    "APPDATA",
    "LOCALAPPDATA",
    "LANG",
    "LC_ALL",
    "TMPDIR",
  ];
  const credentials =
    executable === "gh"
      ? ["GH_TOKEN", "GITHUB_TOKEN"]
      : ["GITLAB_TOKEN", "GLAB_CONFIG_DIR"];
  return Object.fromEntries(
    [...allowed, ...credentials].flatMap((key) =>
      process.env[key] === undefined ? [] : [[key, process.env[key]!]],
    ),
  );
}

async function resolveProviderExecutable(
  executable: "gh" | "glab",
): Promise<string> {
  const resolved = await findProviderExecutable(executable);
  if (resolved) return resolved;
  throw new TaskDeliveryError(
    "TASK_DELIVERY_CLI_MISSING",
    `${executable} was not found in trusted executable locations. Install the hosting CLI and retry delivery.`,
    true,
  );
}

export async function runProviderCli(
  executable: "gh" | "glab",
  args: readonly string[],
): Promise<ProcessResult> {
  const executablePath = await resolveProviderExecutable(executable);
  return new Promise((resolve, reject) => {
    const child = spawn(executablePath, args, {
      shell: false,
      env: safeProviderEnvironment(executable),
      stdio: ["ignore", "pipe", "pipe"],
    });
    const stdout: Buffer[] = [];
    let bytes = 0;
    let settled = false;
    const finishError = (code: string, message: string, retryable: boolean) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      child.kill("SIGKILL");
      reject(new TaskDeliveryError(code, message, retryable));
    };
    child.stdout.on("data", (chunk: Buffer) => {
      bytes += chunk.length;
      if (bytes > MAX_OUTPUT) {
        finishError(
          "TASK_DELIVERY_PROVIDER_RESPONSE_INVALID",
          "The hosting CLI returned too much data",
          true,
        );
        return;
      }
      stdout.push(chunk);
    });
    child.stderr.on("data", () => undefined);
    child.on("error", (error: NodeJS.ErrnoException) => {
      finishError(
        error.code === "ENOENT"
          ? "TASK_DELIVERY_CLI_MISSING"
          : "TASK_DELIVERY_CLI_FAILED",
        `${executable} is not installed or could not be started`,
        false,
      );
    });
    child.on("close", (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (code !== 0) {
        reject(
          new TaskDeliveryError(
            "TASK_DELIVERY_AUTH_OR_PERMISSION",
            `${executable} hosting request failed (exit ${code ?? "signal"}); check authentication, repository permission, and network connectivity.`,
            true,
          ),
        );
        return;
      }
      resolve({ stdout: Buffer.concat(stdout).toString("utf8"), exitCode: 0 });
    });
    const timer = setTimeout(
      () =>
        finishError(
          "TASK_DELIVERY_CLI_TIMEOUT",
          `${executable} did not finish in time`,
          true,
        ),
      PROVIDER_TIMEOUT_MS,
    );
  });
}

export function parseOriginRemote(value: string): RemoteRepository {
  const trimmed = value.trim();
  if (
    !trimmed ||
    [...trimmed].some((character) => {
      const code = character.charCodeAt(0);
      return code <= 0x1f || code === 0x7f;
    })
  )
    throw new TaskDeliveryError(
      "TASK_DELIVERY_ORIGIN_UNSUPPORTED",
      "origin is missing or unsupported",
      false,
    );
  let host: string;
  let project: string;
  let transport: "https" | "ssh";
  const scp = /^(?:[^@/:]+@)?([^/:]+):(.+)$/u.exec(trimmed);
  if (scp && !trimmed.includes("://")) {
    host = scp[1]!.toLowerCase();
    project = scp[2]!;
    transport = "ssh";
  } else {
    let url: URL;
    try {
      url = new URL(trimmed);
    } catch {
      throw new TaskDeliveryError(
        "TASK_DELIVERY_ORIGIN_UNSUPPORTED",
        "origin is missing or unsupported",
        false,
      );
    }
    if (
      !["https:", "ssh:"].includes(url.protocol) ||
      (url.protocol === "https:" && (url.username || url.password))
    )
      throw new TaskDeliveryError(
        "TASK_DELIVERY_ORIGIN_UNSUPPORTED",
        "origin is missing or unsupported",
        false,
      );
    host = url.hostname.toLowerCase();
    project = url.pathname.replace(/^\/+|\/+$/gu, "");
    transport = url.protocol === "https:" ? "https" : "ssh";
  }
  project = project.replace(/\.git$/u, "");
  if (
    !project ||
    project.split("/").some((part) => !part || part === "." || part === "..")
  )
    throw new TaskDeliveryError(
      "TASK_DELIVERY_ORIGIN_UNSUPPORTED",
      "origin is missing or unsupported",
      false,
    );
  const provider =
    host === "github.com" ? "github" : host === "gitlab.com" ? "gitlab" : null;
  if (!provider)
    throw new TaskDeliveryError(
      "TASK_DELIVERY_ORIGIN_UNSUPPORTED",
      "origin hosting provider is not supported",
      false,
    );
  return {
    provider,
    host,
    project,
    owner: project.split("/")[0]!,
    transport,
  };
}

function normalizeTarget(value: string): string {
  const target = value
    .replace(/^refs\/remotes\/origin\//u, "")
    .replace(/^origin\//u, "");
  if (
    !BRANCH_PATTERN.test(target) ||
    target.startsWith("-") ||
    target.includes("..")
  )
    throw new TaskDeliveryError(
      "TASK_DELIVERY_TARGET_INVALID",
      "A valid origin target branch could not be determined",
      false,
    );
  return target;
}

function requireBranch(value: string): string {
  if (
    !BRANCH_PATTERN.test(value) ||
    value.startsWith("-") ||
    value.includes("..")
  )
    throw new TaskDeliveryError(
      "TASK_DELIVERY_BRANCH_INVALID",
      "The task delivery branch is invalid",
      false,
    );
  return value;
}

async function gitAllowFailure(root: string, args: readonly string[]) {
  return runGit(root, args, { allowFailure: true, timeoutMs: 30_000 });
}

async function assertNoSelectedFilters(root: string): Promise<void> {
  const paths = (
    await runGit(root, ["ls-files", "-co", "--exclude-standard", "-z"], {
      diffSafe: true,
    })
  ).stdout;
  if (paths.length === 0) return;
  const attributes = (
    await runGit(root, ["check-attr", "-z", "--stdin", "filter"], {
      diffSafe: true,
      input: paths,
    })
  ).stdout.toString("utf8");
  const fields = attributes.split("\0");
  for (let index = 2; index < fields.length; index += 3) {
    const value = fields[index] ?? "unspecified";
    if (value !== "unspecified" && value !== "unset")
      throw new TaskDeliveryError(
        "TASK_DELIVERY_UNSAFE_GIT_CONFIG",
        "The repository selects an executable Git filter",
        false,
      );
  }
}

export class TaskDeliveryService {
  readonly #runProvider: ProviderRunner;
  readonly #updateBranch?: (branch: string) => Promise<void>;
  readonly #remoteBranchExistsOverride?: DeliveryServiceOptions["remoteBranchExists"];
  readonly #pushOverride?: DeliveryServiceOptions["push"];

  constructor(
    readonly root: string,
    options: DeliveryServiceOptions = {},
  ) {
    this.#runProvider = options.runProvider ?? runProviderCli;
    this.#updateBranch = options.updateBranch;
    this.#remoteBranchExistsOverride = options.remoteBranchExists;
    this.#pushOverride = options.push;
  }

  async inspectStart(input: {
    mode: "new_managed" | "existing";
    branch: string;
    baseRef?: string | null;
    persistedTarget?: string | null;
  }): Promise<GitDeliveryStart> {
    const baselineHead = (
      await gitText(this.root, ["rev-parse", "HEAD"])
    ).trim();
    const initialDirty =
      (
        await runGit(this.root, [
          "status",
          "--porcelain=v2",
          "-z",
          "--untracked-files=all",
        ])
      ).stdout.length > 0;
    const branch = requireBranch(input.branch);
    let target: string;
    if (input.persistedTarget) target = normalizeTarget(input.persistedTarget);
    else if (input.mode === "new_managed")
      target = normalizeTarget(input.baseRef ?? "");
    else {
      const upstream = await gitAllowFailure(this.root, [
        "rev-parse",
        "--abbrev-ref",
        "--symbolic-full-name",
        "@{upstream}",
      ]);
      if (upstream.exitCode === 0) {
        const value = upstream.stdout.toString("utf8").trim();
        if (!value.startsWith("origin/"))
          throw new TaskDeliveryError(
            "TASK_DELIVERY_TARGET_INVALID",
            "The starting branch upstream must belong to origin",
            false,
          );
        target = normalizeTarget(value);
      } else {
        const fallback = await gitAllowFailure(this.root, [
          "symbolic-ref",
          "--quiet",
          "refs/remotes/origin/HEAD",
        ]);
        if (fallback.exitCode !== 0)
          throw new TaskDeliveryError(
            "TASK_DELIVERY_TARGET_INVALID",
            "The starting branch has no upstream and origin/HEAD is unavailable",
            false,
          );
        target = normalizeTarget(fallback.stdout.toString("utf8").trim());
      }
    }
    return { baselineHead, initialDirty, branch, target };
  }

  async activate(start: GitDeliveryStart): Promise<void> {
    const current = (
      await gitText(this.root, ["branch", "--show-current"])
    ).trim();
    if (current !== start.branch) {
      const exists = await gitAllowFailure(this.root, [
        "show-ref",
        "--verify",
        "--quiet",
        `refs/heads/${start.branch}`,
      ]);
      if (exists.exitCode === 0) {
        const existingHead = (
          await gitText(this.root, ["rev-parse", `refs/heads/${start.branch}`])
        ).trim();
        if (existingHead !== start.baselineHead)
          throw new TaskDeliveryError(
            "TASK_DELIVERY_BRANCH_CONFLICT",
            "The persisted task branch does not match this Task",
            false,
          );
        await runGit(this.root, ["switch", start.branch]);
      } else {
        await runGit(this.root, ["switch", "-c", start.branch, "--no-track"]);
      }
    }
    const active = (
      await gitText(this.root, ["branch", "--show-current"])
    ).trim();
    if (active !== start.branch)
      throw new TaskDeliveryError(
        "TASK_DELIVERY_BRANCH_CONFLICT",
        "The task delivery branch could not be activated",
        false,
      );
    await this.#updateBranch?.(start.branch);
  }

  async prepare(input: {
    start: GitDeliveryStart;
    title: string;
  }): Promise<GitPreparationResult> {
    try {
      return await this.#prepare(input);
    } catch (error) {
      throw taskDeliveryFailure(error, "preparation");
    }
  }

  async #prepare(input: {
    start: GitDeliveryStart;
    title: string;
  }): Promise<GitPreparationResult> {
    const branch = requireBranch(input.start.branch);
    const current = (
      await gitText(this.root, ["branch", "--show-current"])
    ).trim();
    if (current !== branch)
      throw new TaskDeliveryError(
        "TASK_DELIVERY_BRANCH_CONFLICT",
        "The workspace is no longer on the persisted task branch",
        false,
      );
    try {
      await assertNoRepositoryGitCommands(this.root);
      await assertNoSelectedFilters(this.root);
    } catch (error) {
      if (error instanceof TaskDeliveryError) throw error;
      throw new TaskDeliveryError(
        "TASK_DELIVERY_UNSAFE_GIT_CONFIG",
        "The repository contains unsafe Git configuration",
        false,
        { cause: error },
      );
    }
    const beforeHead = (await gitText(this.root, ["rev-parse", "HEAD"])).trim();
    const dirty =
      (
        await runGit(this.root, [
          "status",
          "--porcelain=v2",
          "-z",
          "--untracked-files=all",
        ])
      ).stdout.length > 0;
    const changed = beforeHead !== input.start.baselineHead || dirty;
    if (dirty) {
      await runGit(this.root, ["add", "-A"]);
      const staged = await gitAllowFailure(this.root, [
        "diff",
        "--cached",
        "--quiet",
        "--exit-code",
      ]);
      if (staged.exitCode === 1)
        await runGit(
          this.root,
          ["commit", "-m", `Task: ${input.title.slice(0, 120)}`],
          {
            timeoutMs: 60_000,
          },
        );
      else if (staged.exitCode !== 0)
        throw new TaskDeliveryError(
          "TASK_DELIVERY_COMMIT_FAILED",
          "Git could not inspect staged task changes",
          true,
        );
    }
    const head = (await gitText(this.root, ["rev-parse", "HEAD"])).trim();
    if (changed && head === input.start.baselineHead)
      throw new TaskDeliveryError(
        "TASK_DELIVERY_COMMIT_FAILED",
        "Task changes could not be committed",
        true,
      );
    const remaining = await runGit(this.root, [
      "status",
      "--porcelain=v2",
      "-z",
      "--untracked-files=all",
    ]);
    if (remaining.stdout.length > 0)
      throw new TaskDeliveryError(
        "TASK_DELIVERY_WORKTREE_NOT_CLEAN",
        "The Task workspace is not clean after preparing the verification commit",
        false,
      );
    return { changed, head };
  }

  async assertPrepared(prepared: GitPreparationResult): Promise<void> {
    const head = (await gitText(this.root, ["rev-parse", "HEAD"])).trim();
    if (head !== prepared.head)
      throw new TaskDeliveryError(
        "TASK_DELIVERY_COMMIT_CHANGED",
        "The verified Task commit changed before delivery",
        false,
      );
    const dirty = await runGit(this.root, [
      "status",
      "--porcelain=v2",
      "-z",
      "--untracked-files=all",
    ]);
    if (dirty.stdout.length > 0)
      throw new TaskDeliveryError(
        "TASK_DELIVERY_WORKTREE_NOT_CLEAN",
        "The verified Task workspace changed before delivery",
        false,
      );
  }

  async deliver(input: {
    start: GitDeliveryStart;
    title: string;
    summary: string;
    priorChangeRequest?: ChangeRequest;
    prepared?: GitPreparationResult;
  }): Promise<GitDeliveryResult> {
    try {
      return await this.#deliver(input);
    } catch (error) {
      throw taskDeliveryFailure(error, "delivery");
    }
  }

  async #deliver(input: {
    start: GitDeliveryStart;
    title: string;
    summary: string;
    priorChangeRequest?: ChangeRequest;
    prepared?: GitPreparationResult;
  }): Promise<GitDeliveryResult> {
    const branch = requireBranch(input.start.branch);
    const prepared = input.prepared ?? (await this.prepare(input));
    await this.assertPrepared(prepared);
    const head = prepared.head;
    const changed = prepared.changed;
    if (!changed && !input.priorChangeRequest) return prepared;

    let remote: RemoteRepository;
    try {
      remote = parseOriginRemote(
        await gitText(this.root, ["config", "--get", "remote.origin.url"]),
      );
    } catch (error) {
      if (error instanceof TaskDeliveryError) throw error;
      throw new TaskDeliveryError(
        "TASK_DELIVERY_ORIGIN_UNSUPPORTED",
        "origin is missing or unsupported",
        false,
      );
    }
    let candidates = await this.#listChangeRequests(
      remote,
      branch,
      input.start.target,
    );
    if (candidates.length > 1)
      throw new TaskDeliveryError(
        "TASK_DELIVERY_CHANGE_REQUEST_AMBIGUOUS",
        "Multiple change requests match; no branch was pushed.",
        false,
      );
    for (const candidate of candidates) {
      if (candidate.head !== branch || candidate.base !== input.start.target)
        throw new TaskDeliveryError(
          "TASK_DELIVERY_CHANGE_REQUEST_MISMATCH",
          "The matching change request has an unexpected branch or target; no branch was pushed.",
          false,
        );
      if (candidate.state !== "open" || candidate.draft)
        throw new TaskDeliveryError(
          candidate.draft
            ? "TASK_DELIVERY_CHANGE_REQUEST_DRAFT"
            : "TASK_DELIVERY_CHANGE_REQUEST_CLOSED",
          "The matching change request is Draft, closed, or merged; no branch was pushed. Handle it manually or recover its merged receipt.",
          false,
        );
    }
    const remoteExists = await this.#remoteBranchExists(remote, branch);
    if (input.priorChangeRequest && !remoteExists)
      throw new TaskDeliveryError(
        "TASK_DELIVERY_REMOTE_BRANCH_MISSING",
        "The existing remote task branch is missing; restore it or handle the change request manually",
        false,
      );
    if (changed)
      try {
        await this.#push(remote, branch);
      } catch (error) {
        if (error instanceof TaskDeliveryError) throw error;
        throw new TaskDeliveryError(
          "TASK_DELIVERY_PUSH_FAILED",
          "The task branch could not be pushed to origin",
          true,
          { cause: error },
        );
      }

    if (changed && candidates.length > 0)
      candidates = await this.#listChangeRequests(
        remote,
        branch,
        input.start.target,
      );
    let changeRequest: RemoteChangeRequest;
    if (input.priorChangeRequest) {
      const priorUrl = canonicalChangeRequestUrl(
        input.priorChangeRequest.url,
        remote,
      );
      const matched = candidates.filter(
        (candidate) => candidate.url === priorUrl,
      );
      if (matched.length !== 1)
        throw new TaskDeliveryError(
          "TASK_DELIVERY_CHANGE_REQUEST_MISSING",
          "The existing change request is missing or no longer matches this Task",
          false,
        );
      changeRequest = matched[0]!;
    } else if (candidates.length === 0) {
      await this.#createChangeRequest(
        remote,
        branch,
        input.start.target,
        input.title,
        input.summary,
      );
      const created = await this.#listChangeRequests(
        remote,
        branch,
        input.start.target,
      );
      if (created.length !== 1)
        throw new TaskDeliveryError(
          "TASK_DELIVERY_CHANGE_REQUEST_AMBIGUOUS",
          "The created change request could not be identified unambiguously",
          false,
        );
      changeRequest = created[0]!;
    } else if (candidates.length === 1) changeRequest = candidates[0]!;
    else
      throw new TaskDeliveryError(
        "TASK_DELIVERY_CHANGE_REQUEST_AMBIGUOUS",
        "Multiple change requests match the task branch and target",
        false,
      );

    if (changeRequest.state !== "open")
      throw new TaskDeliveryError(
        "TASK_DELIVERY_CHANGE_REQUEST_CLOSED",
        "The Task change request is closed or merged; handle it manually",
        false,
      );
    if (changeRequest.draft)
      throw new TaskDeliveryError(
        "TASK_DELIVERY_CHANGE_REQUEST_DRAFT",
        "The Task change request is Draft; mark it Ready manually before retrying",
        false,
      );
    if (
      changeRequest.head !== branch ||
      changeRequest.base !== input.start.target
    )
      throw new TaskDeliveryError(
        "TASK_DELIVERY_CHANGE_REQUEST_MISMATCH",
        "The Task change request branch or target does not match persisted delivery identity",
        false,
      );
    return {
      changed,
      head,
      changeRequest: {
        kind: remote.provider === "github" ? "github_pr" : "gitlab_mr",
        url: canonicalChangeRequestUrl(changeRequest.url, remote),
        draft: false,
      },
    };
  }

  async #withGitCredentials<T>(
    remote: RemoteRepository,
    operation: (environment?: Readonly<Record<string, string>>) => Promise<T>,
  ): Promise<T> {
    if (remote.transport !== "https") return operation();
    const executable = remote.provider === "github" ? "gh" : "glab";
    let tokenResult: ProcessResult;
    try {
      tokenResult = await this.#runProvider(executable, [
        "auth",
        "token",
        "--hostname",
        remote.host,
      ]);
    } catch (error) {
      if (error instanceof TaskDeliveryError) throw error;
      throw new TaskDeliveryError(
        "TASK_DELIVERY_AUTH_OR_PERMISSION",
        `${executable} is not authenticated or lacks repository permission`,
        true,
        { cause: error },
      );
    }
    const token = tokenResult.stdout.trim();
    if (
      !token ||
      token.length > 4096 ||
      token.includes("\r") ||
      token.includes("\n")
    )
      throw new TaskDeliveryError(
        "TASK_DELIVERY_AUTH_OR_PERMISSION",
        `${executable} did not provide a usable Git credential`,
        true,
      );
    return withGitAskpass(
      {
        username: remote.provider === "github" ? "x-access-token" : "oauth2",
        token,
      },
      operation,
    );
  }

  async #remoteBranchExists(
    remote: RemoteRepository,
    branch: string,
  ): Promise<boolean> {
    if (this.#remoteBranchExistsOverride)
      return this.#remoteBranchExistsOverride(remote, branch);
    return this.#withGitCredentials(remote, async (environment) => {
      const result = await runGit(
        this.root,
        [
          "ls-remote",
          "--exit-code",
          "--heads",
          "origin",
          `refs/heads/${branch}`,
        ],
        { allowFailure: true, timeoutMs: 30_000, environment },
      );
      return result.exitCode === 0;
    });
  }

  async #push(remote: RemoteRepository, branch: string): Promise<void> {
    if (this.#pushOverride) return this.#pushOverride(remote, branch);
    await this.#withGitCredentials(remote, (environment) =>
      runGit(
        this.root,
        [
          "push",
          "--set-upstream",
          "origin",
          `refs/heads/${branch}:refs/heads/${branch}`,
        ],
        {
          timeoutMs: 120_000,
          maxOutput: MAX_OUTPUT,
          environment,
        },
      ).then(() => undefined),
    );
  }

  async findMergedDelivery(
    start: GitDeliveryStart,
  ): Promise<GitDeliveryResult | null> {
    try {
      const branch = requireBranch(start.branch);
      if (
        (await gitText(this.root, ["branch", "--show-current"])).trim() !==
        branch
      )
        return null;
      await assertNoRepositoryGitCommands(this.root);
      const head = (await gitText(this.root, ["rev-parse", "HEAD"])).trim();
      await this.assertPrepared({ changed: true, head });
      const remote = parseOriginRemote(
        await gitText(this.root, ["config", "--get", "remote.origin.url"]),
      );
      const candidates = await this.#listChangeRequests(
        remote,
        branch,
        start.target,
      );
      if (candidates.length !== 1) return null;
      const candidate = candidates[0]!;
      if (
        !candidate.merged ||
        candidate.state !==
          (remote.provider === "github" ? "closed" : "merged") ||
        candidate.draft ||
        candidate.head !== branch ||
        candidate.base !== start.target ||
        candidate.headSha !== head ||
        candidate.sourceProject?.toLowerCase() !== remote.project.toLowerCase()
      )
        return null;
      // Recheck local invariants after the hosting request; no publish operation is used here.
      if (
        (await gitText(this.root, ["branch", "--show-current"])).trim() !==
        branch
      )
        return null;
      await this.assertPrepared({ changed: true, head });
      return {
        changed: true,
        head,
        changeRequest: {
          kind: remote.provider === "github" ? "github_pr" : "gitlab_mr",
          url: candidate.url,
          draft: false,
        },
      };
    } catch (error) {
      throw taskDeliveryFailure(error, "reconciliation");
    }
  }

  async #listChangeRequests(
    remote: RemoteRepository,
    branch: string,
    target: string,
  ): Promise<RemoteChangeRequest[]> {
    if (remote.provider === "github") {
      const query = new URLSearchParams({
        state: "all",
        head: `${remote.owner}:${branch}`,
        base: target,
        per_page: "100",
      });
      const value = await this.#json("gh", [
        "api",
        "--hostname",
        remote.host,
        `repos/${remote.project}/pulls?${query.toString()}`,
      ]);
      if (!Array.isArray(value)) return this.#invalidProviderResponse();
      return value.map((item) => {
        const record = requireRecord(item);
        return {
          url: canonicalChangeRequestUrl(
            requireString(record.html_url),
            remote,
          ),
          draft: requireBoolean(record.draft),
          state: requireString(record.state).toLowerCase(),
          head: requireString(requireRecord(record.head).ref),
          base: requireString(requireRecord(record.base).ref),
          headSha:
            typeof requireRecord(record.head).sha === "string"
              ? (requireRecord(record.head).sha as string)
              : undefined,
          sourceProject:
            typeof requireRecord(record.head).repo === "object" &&
            requireRecord(record.head).repo !== null
              ? requireString(
                  requireRecord(requireRecord(record.head).repo).full_name,
                )
              : undefined,
          merged:
            typeof record.merged_at === "string" && record.merged_at.length > 0,
        };
      });
    }
    const query = new URLSearchParams({
      state: "all",
      source_branch: branch,
      target_branch: target,
      per_page: "100",
    });
    const value = await this.#json("glab", [
      "api",
      "--hostname",
      remote.host,
      `projects/${encodeURIComponent(remote.project)}/merge_requests?${query.toString()}`,
    ]);
    if (!Array.isArray(value)) return this.#invalidProviderResponse();
    return value.map((item) => {
      const record = requireRecord(item);
      const state = requireString(record.state).toLowerCase();
      return {
        headSha: typeof record.sha === "string" ? record.sha : undefined,
        sourceProject:
          record.source_project_id === record.target_project_id &&
          typeof record.source_project_id === "number"
            ? remote.project
            : undefined,
        merged: state === "merged",
        url: canonicalChangeRequestUrl(requireString(record.web_url), remote),
        draft: requireBoolean(record.draft),
        state: state === "opened" ? "open" : state,
        head: requireString(record.source_branch),
        base: requireString(record.target_branch),
      };
    });
  }

  async #createChangeRequest(
    remote: RemoteRepository,
    branch: string,
    target: string,
    title: string,
    summary: string,
  ): Promise<void> {
    if (remote.provider === "github") {
      await this.#json("gh", [
        "api",
        "--hostname",
        remote.host,
        "--method",
        "POST",
        `repos/${remote.project}/pulls`,
        "-f",
        `title=${title.slice(0, 200)}`,
        "-f",
        `head=${branch}`,
        "-f",
        `base=${target}`,
        "-f",
        `body=${summary.slice(0, 8_000)}`,
      ]);
      return;
    }
    await this.#json("glab", [
      "api",
      "--hostname",
      remote.host,
      "--method",
      "POST",
      `projects/${encodeURIComponent(remote.project)}/merge_requests`,
      "-f",
      `source_branch=${branch}`,
      "-f",
      `target_branch=${target}`,
      "-f",
      `title=${title.slice(0, 200)}`,
      "-f",
      `description=${summary.slice(0, 8_000)}`,
    ]);
  }

  async #json(
    executable: "gh" | "glab",
    args: readonly string[],
  ): Promise<unknown> {
    let output: ProcessResult;
    try {
      output = await this.#runProvider(executable, args);
    } catch (error) {
      if (error instanceof TaskDeliveryError) throw error;
      throw new TaskDeliveryError(
        "TASK_DELIVERY_AUTH_OR_PERMISSION",
        `${executable} is not authenticated or lacks repository permission`,
        true,
        { cause: error },
      );
    }
    try {
      return JSON.parse(output.stdout) as unknown;
    } catch {
      return this.#invalidProviderResponse();
    }
  }

  #invalidProviderResponse(): never {
    throw new TaskDeliveryError(
      "TASK_DELIVERY_PROVIDER_RESPONSE_INVALID",
      "The hosting CLI returned an invalid response",
      true,
    );
  }
}

function requireRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new TaskDeliveryError(
      "TASK_DELIVERY_PROVIDER_RESPONSE_INVALID",
      "The hosting CLI returned an invalid response",
      true,
    );
  return value as Record<string, unknown>;
}

function requireString(value: unknown): string {
  if (typeof value !== "string" || !value)
    throw new TaskDeliveryError(
      "TASK_DELIVERY_PROVIDER_RESPONSE_INVALID",
      "The hosting CLI returned an invalid response",
      true,
    );
  return value;
}

function requireBoolean(value: unknown): boolean {
  if (typeof value !== "boolean")
    throw new TaskDeliveryError(
      "TASK_DELIVERY_PROVIDER_RESPONSE_INVALID",
      "The hosting CLI returned an invalid response",
      true,
    );
  return value;
}

function canonicalChangeRequestUrl(
  value: string,
  remote: RemoteRepository,
): string {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new TaskDeliveryError(
      "TASK_DELIVERY_PROVIDER_RESPONSE_INVALID",
      "The hosting CLI returned an invalid change request URL",
      true,
    );
  }
  const marker = remote.provider === "github" ? "/pull/" : "/-/merge_requests/";
  if (
    url.protocol !== "https:" ||
    url.hostname.toLowerCase() !== remote.host ||
    url.username ||
    url.password ||
    url.port ||
    !url.pathname.startsWith(`/${remote.project}${marker}`) ||
    !/^[1-9][0-9]*\/?$/.test(
      url.pathname.slice(`/${remote.project}${marker}`.length),
    )
  )
    throw new TaskDeliveryError(
      "TASK_DELIVERY_PROVIDER_RESPONSE_INVALID",
      "The hosting CLI returned an invalid change request URL",
      true,
    );
  url.hash = "";
  url.search = "";
  return url.toString();
}

export function taskDeliveryBranch(taskId: string): string {
  const compact = taskId.replace(/-/gu, "").slice(0, 16).toLowerCase();
  return requireBranch(`spire/task-${compact}`);
}

export function taskDeliveryFailure(
  error: unknown,
  phase: "preparation" | "delivery" | "reconciliation",
): TaskDeliveryError {
  if (error instanceof TaskDeliveryError) return error;
  const record =
    error && typeof error === "object"
      ? (error as {
          code?: unknown;
          name?: unknown;
          details?: { exitCode?: unknown };
        })
      : {};
  const code =
    typeof record.code === "string" &&
    /^[A-Z][A-Z0-9_]{0,63}$/.test(record.code)
      ? record.code
      : "UNEXPECTED_ERROR";
  const exitCode = record.details?.exitCode;
  const suffix =
    typeof exitCode === "string" && /^[0-9]{1,3}$/.test(exitCode)
      ? `; exit ${exitCode}`
      : "";
  return new TaskDeliveryError(
    `TASK_DELIVERY_${code}`,
    `Task Git ${phase} failed (${code}${suffix}). The coding report was retained; retry delivery after resolving the host error.`,
    code !== "GIT_UNSAFE_CONFIG",
    { cause: error },
  );
}
