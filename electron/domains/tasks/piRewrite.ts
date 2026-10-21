import { isAbsolute } from "node:path";
import {
  ModelRuntime,
  SessionManager,
  createAgentSessionFromServices,
  createAgentSessionServices,
} from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";

export const TASK_REWRITE_TOOL_NAME = "submit_task_rewrite";
export const DEFAULT_TASK_REWRITE_TIMEOUT_MS = 60_000;

const MAX_TITLE_BYTES = 200;
const MAX_DESCRIPTION_BYTES = 64 * 1024;
const MAX_CRITERIA = 50;
const MAX_CRITERION_BYTES = 2 * 1024;

export interface TaskRewriteDraft {
  title: string;
  description: string;
  acceptanceCriteria: string[];
}

export type TaskRewriteErrorCode =
  | "TASK_REWRITE_BUSY"
  | "TASK_REWRITE_ABORTED"
  | "TASK_REWRITE_TIMEOUT"
  | "TASK_REWRITE_NO_RESULT"
  | "TASK_REWRITE_UNAVAILABLE"
  | "TASK_RESULT_INVALID";

export class TaskRewriteError extends Error {
  constructor(
    readonly code: TaskRewriteErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "TaskRewriteError";
  }
}

interface ToolResult {
  content: Array<{ type: "text"; text: string }>;
  details?: unknown;
  isError?: boolean;
}

export interface TaskRewriteToolDefinition {
  name: string;
  label: string;
  description: string;
  parameters: unknown;
  execute(
    toolCallId: string,
    params: unknown,
    signal?: AbortSignal,
    onUpdate?: unknown,
    context?: unknown,
  ): Promise<ToolResult>;
}

export interface TaskRewriteSession {
  subscribe(listener: (event: unknown) => void): () => void;
  prompt(
    text: string,
    options?: { expandPromptTemplates?: boolean },
  ): Promise<void>;
  abort(): Promise<void>;
  dispose(): void | Promise<void>;
}

export interface TaskRewriteSessionFactory {
  create(options: {
    tool: TaskRewriteToolDefinition;
  }): Promise<TaskRewriteSession>;
}

export interface TaskRewriteServiceOptions {
  timeoutMs?: number;
}

interface ActiveRewrite {
  session?: TaskRewriteSession;
  reject(error: TaskRewriteError): void;
  aborted?: boolean;
  abortPromise?: Promise<void>;
}

/**
 * Runs one restricted, in-memory rewrite at a time. A rewrite is accepted only
 * through submit_task_rewrite; assistant text is never interpreted as data.
 */
export class TaskRewriteService {
  private active: ActiveRewrite | undefined;
  private disposed = false;
  private readonly timeoutMs: number;

  constructor(
    private readonly factory: TaskRewriteSessionFactory,
    options: TaskRewriteServiceOptions = {},
  ) {
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TASK_REWRITE_TIMEOUT_MS;
    if (!Number.isSafeInteger(this.timeoutMs) || this.timeoutMs <= 0)
      throw new Error("Task rewrite timeout must be a positive integer");
  }

  async rewrite(
    input: TaskRewriteDraft,
    options: { signal?: AbortSignal } = {},
  ): Promise<TaskRewriteDraft> {
    if (this.disposed)
      throw new TaskRewriteError(
        "TASK_REWRITE_ABORTED",
        "Task rewrite service is disposed",
      );
    if (this.active)
      throw new TaskRewriteError(
        "TASK_REWRITE_BUSY",
        "A task rewrite is already active",
      );

    const validatedInput = validateTaskRewrite(input, false);
    let resolveResult!: (result: TaskRewriteDraft) => void;
    let rejectResult!: (error: TaskRewriteError) => void;
    const resultPromise = new Promise<TaskRewriteDraft>((resolve, reject) => {
      resolveResult = resolve;
      rejectResult = reject;
    });
    // The factory may still be starting when abort/timeout rejects the result.
    // Mark it observed immediately; the awaited promise below still propagates it.
    void resultPromise.catch(() => undefined);
    const active: ActiveRewrite = { reject: rejectResult };
    this.active = active;

    let submitted = false;
    const tool: TaskRewriteToolDefinition = {
      name: TASK_REWRITE_TOOL_NAME,
      label: "Submit task rewrite",
      description:
        "Submit the final rewritten title, description, and acceptance criteria. Call exactly once.",
      parameters: rewriteParametersSchema,
      async execute(_toolCallId, params) {
        if (submitted)
          return toolError("A task rewrite has already been submitted");
        try {
          const result = validateTaskRewrite(params);
          submitted = true;
          resolveResult(result);
          return {
            content: [{ type: "text", text: "Task rewrite submitted" }],
            details: undefined,
          };
        } catch (error) {
          return toolError(errorMessage(error));
        }
      },
    };

    let session: TaskRewriteSession | undefined;
    let unsubscribe: () => void = () => undefined;
    let timeout: ReturnType<typeof setTimeout> | undefined;
    const onAbort = () => {
      void this.abort();
    };

    try {
      if (options.signal?.aborted)
        throw new TaskRewriteError(
          "TASK_REWRITE_ABORTED",
          "Task rewrite was aborted",
        );

      session = await this.factory.create({ tool });
      active.session = session;
      if (active.aborted || options.signal?.aborted) {
        active.aborted = true;
        await this.abortSession(active);
        throw new TaskRewriteError(
          "TASK_REWRITE_ABORTED",
          "Task rewrite was aborted",
        );
      }
      options.signal?.addEventListener("abort", onAbort, { once: true });
      unsubscribe = session.subscribe((event) => {
        if (isSettledEvent(event) && !submitted) {
          rejectResult(
            new TaskRewriteError(
              "TASK_REWRITE_NO_RESULT",
              "Task rewrite settled without submitting a result",
            ),
          );
        }
      });
      timeout = setTimeout(() => {
        rejectResult(
          new TaskRewriteError(
            "TASK_REWRITE_TIMEOUT",
            "Task rewrite timed out",
          ),
        );
      }, this.timeoutMs);

      void session
        .prompt(buildRewritePrompt(validatedInput), {
          expandPromptTemplates: false,
        })
        .catch((error: unknown) => {
          rejectResult(
            new TaskRewriteError(
              "TASK_REWRITE_NO_RESULT",
              `Task rewrite failed before submitting a result: ${errorMessage(error)}`,
            ),
          );
        });

      const result = await resultPromise;
      await this.abortSession(active);
      return result;
    } catch (error) {
      if (error instanceof TaskRewriteError) {
        if (error.code === "TASK_REWRITE_TIMEOUT")
          await this.abortSession(active);
        throw error;
      }
      throw new TaskRewriteError(
        "TASK_REWRITE_NO_RESULT",
        `Task rewrite could not start: ${errorMessage(error)}`,
      );
    } finally {
      if (timeout) clearTimeout(timeout);
      options.signal?.removeEventListener("abort", onAbort);
      unsubscribe();
      if (session) await session.dispose();
      if (this.active === active) this.active = undefined;
    }
  }

  async abort(): Promise<void> {
    const active = this.active;
    if (!active) return;
    active.aborted = true;
    active.reject(
      new TaskRewriteError("TASK_REWRITE_ABORTED", "Task rewrite was aborted"),
    );
    await this.abortSession(active);
  }

  async dispose(): Promise<void> {
    this.disposed = true;
    await this.abort();
  }

  private abortSession(active: ActiveRewrite): Promise<void> {
    if (!active.session) return Promise.resolve();
    active.abortPromise ??= active.session.abort();
    return active.abortPromise;
  }
}

interface PiRewriteSessionManager {
  isPersisted?(): boolean;
}

interface PiRewriteSdk {
  ModelRuntime: { create(): Promise<unknown> };
  SessionManager: {
    inMemory(cwd?: string): PiRewriteSessionManager;
  };
  createAgentSessionServices(options: {
    cwd: string;
    modelRuntime: unknown;
    resourceLoaderOptions: Record<string, unknown>;
  }): Promise<unknown>;
  createAgentSessionFromServices(options: {
    services: unknown;
    sessionManager: PiRewriteSessionManager;
    tools: string[];
    noTools: "all";
    customTools: TaskRewriteToolDefinition[];
  }): Promise<{ session: TaskRewriteSession }>;
}

export interface DefaultTaskRewriteServiceOptions extends TaskRewriteServiceOptions {
  /** An empty, Main-owned directory below userData; never a project/worktree cwd. */
  controlledCwd: string;
  /** Prefer AppState's shared configured runtime; omitted creates the SDK default. */
  modelRuntime?: unknown;
  sdk?: PiRewriteSdk;
}

/** Production boundary kept injectable so Main can provide its shared ModelRuntime. */
export async function createDefaultTaskRewriteService(
  options: DefaultTaskRewriteServiceOptions,
): Promise<TaskRewriteService> {
  if (!isAbsolute(options.controlledCwd))
    throw new Error(
      "Task rewrite cwd must be an absolute Main-controlled path",
    );

  const sdk =
    options.sdk ??
    ({
      ModelRuntime,
      SessionManager,
      createAgentSessionServices,
      createAgentSessionFromServices,
    } as unknown as PiRewriteSdk);
  const modelRuntime =
    options.modelRuntime ?? (await sdk.ModelRuntime.create());

  const factory: TaskRewriteSessionFactory = {
    async create({ tool }) {
      const services = await sdk.createAgentSessionServices({
        cwd: options.controlledCwd,
        modelRuntime,
        resourceLoaderOptions: {
          noExtensions: true,
          disabledBuiltinExtensions: ["mcp", "codemode", "tool_search"],
          noSkills: true,
          noPromptTemplates: true,
          noThemes: true,
          noContextFiles: true,
          additionalExtensionPaths: [],
          additionalSkillPaths: [],
          additionalPromptTemplatePaths: [],
          additionalThemePaths: [],
          extensionsOverride: emptyExtensions,
          skillsOverride: emptySkills,
          promptsOverride: emptyPrompts,
          themesOverride: emptyThemes,
          agentsFilesOverride: emptyAgentsFiles,
          systemPromptOverride: () => undefined,
          appendSystemPromptOverride: () => [],
        },
      });
      const manager = sdk.SessionManager.inMemory(options.controlledCwd);
      if (manager.isPersisted?.() === true)
        throw new Error("Task rewrite session manager must be in-memory");
      const created = await sdk.createAgentSessionFromServices({
        services,
        sessionManager: manager,
        noTools: "all",
        tools: [TASK_REWRITE_TOOL_NAME],
        customTools: [tool],
      });
      return created.session;
    },
  };

  return new TaskRewriteService(factory, { timeoutMs: options.timeoutMs });
}

const rewriteParametersSchema = Type.Object(
  {
    title: Type.String(),
    description: Type.String(),
    acceptanceCriteria: Type.Array(Type.String(), {
      minItems: 1,
      maxItems: MAX_CRITERIA,
    }),
  },
  { additionalProperties: false },
);

function validateTaskRewrite(
  value: unknown,
  requireCriteria = true,
): TaskRewriteDraft {
  if (!isPlainRecord(value)) return invalid("Rewrite must be an object");
  if (!hasExactKeys(value, ["title", "description", "acceptanceCriteria"]))
    return invalid("Rewrite contains missing or unsupported fields");
  if (typeof value.title !== "string") return invalid("Title must be a string");
  if (typeof value.description !== "string")
    return invalid("Description must be a string");
  if (!Array.isArray(value.acceptanceCriteria))
    return invalid("Acceptance criteria must be an array");

  const title = value.title.trim();
  if (!title || byteLength(title) > MAX_TITLE_BYTES)
    return invalid("Title must be between 1 and 200 UTF-8 bytes");
  if (byteLength(value.description) > MAX_DESCRIPTION_BYTES)
    return invalid("Description exceeds 64 KiB");
  if (value.acceptanceCriteria.length > MAX_CRITERIA)
    return invalid("Acceptance criteria must contain at most 50 items");

  const acceptanceCriteria = value.acceptanceCriteria
    .map((criterion) => {
      if (typeof criterion !== "string")
        return invalid("Each acceptance criterion must be a string");
      const normalized = criterion.trim();
      if (!normalized && !requireCriteria) return null;
      const bytes = byteLength(normalized);
      if (!normalized || bytes > MAX_CRITERION_BYTES)
        return invalid(
          "Each acceptance criterion must be between 1 and 2048 UTF-8 bytes",
        );
      return normalized;
    })
    .filter((criterion): criterion is string => criterion !== null);
  if (requireCriteria && acceptanceCriteria.length < 1)
    return invalid("Acceptance criteria must contain 1 to 50 items");
  return { title, description: value.description, acceptanceCriteria };
}

function buildRewritePrompt(input: TaskRewriteDraft): string {
  return [
    "Rewrite this task for clarity without changing its intent.",
    `You must call ${TASK_REWRITE_TOOL_NAME} exactly once.`,
    "Only title, description, and acceptanceCriteria may be returned.",
    "Plain assistant text is not accepted as a result.",
    JSON.stringify(input),
  ].join("\n");
}

function emptyExtensions(base: unknown): unknown {
  if (!isPlainRecord(base)) return base;
  return { ...base, extensions: [], errors: [] };
}

function emptySkills(): { skills: never[]; diagnostics: never[] } {
  return { skills: [], diagnostics: [] };
}

function emptyPrompts(): { prompts: never[]; diagnostics: never[] } {
  return { prompts: [], diagnostics: [] };
}

function emptyThemes(): { themes: never[]; diagnostics: never[] } {
  return { themes: [], diagnostics: [] };
}

function emptyAgentsFiles(): { agentsFiles: never[] } {
  return { agentsFiles: [] };
}

function toolError(message: string): ToolResult {
  return {
    content: [{ type: "text", text: message }],
    details: undefined,
    isError: true,
  };
}

function invalid(message: string): never {
  throw new TaskRewriteError("TASK_RESULT_INVALID", message);
}

function isSettledEvent(value: unknown): boolean {
  return isPlainRecord(value) && value.type === "agent_settled";
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value))
    return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function hasExactKeys(
  value: Record<string, unknown>,
  expected: readonly string[],
): boolean {
  const keys = Object.keys(value).sort();
  return (
    keys.length === expected.length &&
    [...expected].sort().every((key, index) => keys[index] === key)
  );
}

function byteLength(value: string): number {
  return Buffer.byteLength(value, "utf8");
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
