import type {
  AgentSession,
  AgentSessionEvent,
  ExtensionUIContext,
  Extension,
  LoadExtensionsResult,
  Theme,
} from "@earendil-works/pi-coding-agent";
import {
  ModelRuntime,
  SessionManager,
  createAgentSessionFromServices,
  createAgentSessionServices,
} from "@earendil-works/pi-coding-agent";
import { bootstrapArkApiKeyFromLoginShell } from "./shellEnvironment.js";
import { loadSpireSettings, resolveSpireResources } from "./spireSettings.js";
import { realpath, stat } from "node:fs/promises";
import path from "node:path";
import type {
  ChatSessionConfig,
  ChatSlashCommand,
  ChatThinkingLevel,
} from "./types.js";

export interface PiSession {
  readonly sessionId: string;
  readonly name?: string;
  readonly isStreaming: boolean;
  readonly activity: string | null;
  readonly isIdle: boolean;
  subscribe(listener: (event: unknown) => void): () => void;
  getMessages(): Promise<unknown[]>;
  getEntries(): Promise<unknown[]>;
  getConfig(): Promise<ChatSessionConfig>;
  setModel(provider: string, modelId: string): Promise<ChatSessionConfig>;
  setThinkingLevel(level: ChatThinkingLevel): Promise<ChatSessionConfig>;
  send(text: string): Promise<void>;
  followUp(text: string): Promise<void>;
  clearQueue(): { steering?: readonly string[]; followUp?: readonly string[] };
  abort(): Promise<void>;
  dispose(): void | Promise<void>;
}

export interface PiSessionRecord {
  session: PiSession;
  sessionId: string;
  cwd: string;
  title: string;
  createdAt: number;
  updatedAt: number;
}

export interface PiSessionInfo {
  sessionId: string;
  cwd: string;
  title: string;
  path?: string;
  createdAt: number;
  updatedAt: number;
}

export interface PiAdapter {
  create(cwd: string): Promise<PiSessionRecord>;
  list(cwd: string): Promise<PiSessionInfo[]>;
  resolveDeleteTarget(
    cwd: string,
    sessionId: string,
  ): Promise<{ info: PiSessionInfo; sessionRoot: string } | undefined>;
  openById(
    cwd: string,
    sessionId: string,
  ): Promise<PiSessionRecord | undefined>;
  open(info: PiSessionInfo, cwd: string): Promise<PiSessionRecord>;
}

interface PiModel {
  provider: string;
  id: string;
  name?: string;
  reasoning?: boolean;
}

interface PiModelRuntime {
  getModel(provider: string, modelId: string): unknown;
  getAvailable(): Promise<readonly unknown[]>;
  hasConfiguredAuth(provider: string): boolean;
}

export interface PiSettingsManager {
  getDefaultProvider(): string | undefined;
  getDefaultModel(): string | undefined;
}

interface PiSessionManager {
  buildSessionContext(): { messages: unknown[] };
  getCwd(): string;
  getBranch(): unknown[];
  getSessionDir(): string;
}

interface PiServices {
  modelRuntime: PiModelRuntime;
  settingsManager: PiSettingsManager;
  diagnostics?: Array<{ type: "info" | "warning" | "error"; message: string }>;
}

interface PiResourceLoaderOptions {
  noExtensions: boolean;
  noSkills?: boolean;
  noPromptTemplates?: boolean;
  noThemes?: boolean;
  additionalExtensionPaths: string[];
  additionalSkillPaths?: string[];
  additionalPromptTemplatePaths?: string[];
  additionalThemePaths?: string[];
  extensionsOverride?: (result: LoadExtensionsResult) => LoadExtensionsResult;
}

export interface PiSdk {
  ModelRuntime: { create(): Promise<PiModelRuntime> };
  SessionManager: {
    create(cwd: string): PiSessionManager;
    list(cwd: string): Promise<Array<Record<string, unknown>>>;
    findById(cwd: string, id: string): string | undefined;
    open(
      path: string,
      sessionDir?: string,
      cwdOverride?: string,
    ): PiSessionManager;
  };
  createAgentSessionServices(options: {
    cwd: string;
    modelRuntime: PiModelRuntime;
    settingsManager?: PiSettingsManager;
    resourceLoaderOptions?: PiResourceLoaderOptions;
  }): Promise<PiServices>;
  createAgentSessionFromServices(options: {
    services: PiServices;
    sessionManager: PiSessionManager;
    model?: unknown;
  }): Promise<{
    session: AgentSession;
    extensionsResult?: {
      runtime?: { getCommands(): unknown[] };
    };
  }>;
}

function createExtensionUiContext(
  onWorkingMessage: (message?: string) => void,
): ExtensionUIContext {
  const theme = new Proxy(
    {},
    {
      get: () => (_color: string, text: string) => text,
    },
  ) as Theme;
  return {
    select: async () => undefined,
    confirm: async () => false,
    input: async () => undefined,
    notify: () => undefined,
    onTerminalInput: () => () => undefined,
    setStatus: () => undefined,
    setWorkingMessage: onWorkingMessage,
    setWorkingVisible: () => undefined,
    setWorkingIndicator: () => undefined,
    setHiddenThinkingLabel: () => undefined,
    setWidget: () => undefined,
    setFooter: () => undefined,
    setHeader: () => undefined,
    setTitle: () => undefined,
    custom: async () => undefined as never,
    pasteToEditor: () => undefined,
    setEditorText: () => undefined,
    getEditorText: () => "",
    editor: async () => undefined,
    addAutocompleteProvider: () => undefined,
    setEditorComponent: () => undefined,
    getEditorComponent: () => undefined,
    get theme() {
      return theme;
    },
    getAllThemes: () => [],
    getTheme: () => undefined,
    setTheme: () => ({ success: false, error: "Theme UI is unavailable" }),
    getToolsExpanded: () => false,
    setToolsExpanded: () => undefined,
  };
}

export interface PiAdapterOptions {
  loadResources?: (cwd: string) => Promise<{
    settingsManager: PiSettingsManager;
    resourceLoaderOptions: PiResourceLoaderOptions;
    diagnostics: string[];
  }>;
}

export async function createPiAdapter(
  sdk: PiSdk = {
    ModelRuntime,
    SessionManager,
    createAgentSessionServices,
    createAgentSessionFromServices,
  } as unknown as PiSdk,
  options: PiAdapterOptions = {},
): Promise<PiAdapter> {
  const modelRuntime = await sdk.ModelRuntime.create();
  const loadResources = options.loadResources ?? loadDefaultResources;

  const wrap = (
    session: AgentSession,
    sessionManager: PiSessionManager,
    sessionModelRuntime: PiModelRuntime,
    runtimeCommands: () => unknown[],
    extensionActivity: {
      get(): string | null;
      subscribe(listener: (event: unknown) => void): () => void;
    },
  ): PiSession => {
    const getConfig = async (): Promise<ChatSessionConfig> => {
      const models = (await sessionModelRuntime.getAvailable())
        .filter(isPiModel)
        .map((model) => ({
          provider: model.provider,
          id: model.id,
          label: model.name || model.id,
          reasoning: model.reasoning === true,
        }));
      const promptHints = new Map(
        session.promptTemplates.map((template) => [
          template.name,
          template.argumentHint,
        ]),
      );
      const commands = runtimeCommands()
        .map(normalizeCommand)
        .filter(
          (command): command is ChatSlashCommand =>
            Boolean(command) &&
            command?.name !== "model" &&
            command?.name !== "thinking",
        )
        .map((command) =>
          command.source === "prompt" && promptHints.get(command.name)
            ? { ...command, argumentHint: promptHints.get(command.name) }
            : command,
        );
      commands.push(
        {
          name: "model",
          description: "Select model",
          argumentHint: "<provider/model>",
          source: "builtin",
        },
        {
          name: "thinking",
          description: "Set thinking level",
          argumentHint: "<off|minimal|low|medium|high|xhigh|max>",
          source: "builtin",
        },
      );
      return {
        model: session.model
          ? { provider: session.model.provider, id: session.model.id }
          : null,
        models,
        thinkingLevel: session.thinkingLevel,
        availableThinkingLevels: session.getAvailableThinkingLevels(),
        commands,
      };
    };

    return {
      sessionId: session.sessionId,
      name: session.sessionName,
      get isStreaming() {
        return session.isStreaming;
      },
      get isIdle() {
        return session.isIdle;
      },
      get activity() {
        return extensionActivity.get();
      },
      subscribe(listener) {
        const unsubscribeSession = session.subscribe(
          listener as (event: AgentSessionEvent) => void,
        );
        const unsubscribeActivity = extensionActivity.subscribe(listener);
        return () => {
          unsubscribeSession();
          unsubscribeActivity();
        };
      },
      getMessages: async () => session.messages,
      getEntries: async () => sessionManager.getBranch(),
      getConfig,
      async setModel(provider, modelId) {
        const model = (await sessionModelRuntime.getAvailable()).find(
          (candidate) =>
            isPiModel(candidate) &&
            candidate.provider === provider &&
            candidate.id === modelId,
        );
        if (!model)
          throw new Error(
            `Configured model ${provider}/${modelId} is unavailable`,
          );
        await session.setModel(
          model as Parameters<AgentSession["setModel"]>[0],
        );
        return getConfig();
      },
      async setThinkingLevel(level) {
        session.setThinkingLevel(level);
        return getConfig();
      },
      send: (text) =>
        acceptPrompt(
          session,
          text,
          session.isStreaming ? "followUp" : undefined,
        ),
      followUp: (text) => session.followUp(text),
      clearQueue: () => session.clearQueue(),
      abort: () => session.abort(),
      dispose: () => session.dispose(),
    };
  };

  const load = async (
    sessionManager: PiSessionManager,
    cwd: string,
    metadata: Partial<PiSessionInfo> = {},
  ): Promise<PiSessionRecord> => {
    const resources = await loadResources(cwd);
    const services = await sdk.createAgentSessionServices({
      cwd,
      modelRuntime,
      settingsManager: resources.settingsManager,
      resourceLoaderOptions: resources.resourceLoaderOptions,
    });
    assertResourcesLoaded(services);
    const hasExistingMessages =
      sessionManager.buildSessionContext().messages.length > 0;
    const model = hasExistingMessages
      ? undefined
      : await configuredDefaultModel(services);
    const created = await sdk.createAgentSessionFromServices({
      services,
      sessionManager,
      model,
    });
    const { session } = created;
    let activity: string | null = null;
    const activityListeners = new Set<(event: unknown) => void>();
    await session.bindExtensions({
      mode: "rpc",
      uiContext: createExtensionUiContext((message) => {
        activity = message ?? null;
        const event = { type: "extension_status", message };
        for (const listener of activityListeners) listener(event);
      }),
    });
    const now = Date.now();
    return {
      session: wrap(
        session,
        sessionManager,
        services.modelRuntime,
        () => created.extensionsResult?.runtime?.getCommands() ?? [],
        {
          get: () => activity,
          subscribe(listener) {
            activityListeners.add(listener);
            return () => activityListeners.delete(listener);
          },
        },
      ),
      sessionId: session.sessionId,
      cwd,
      title: session.sessionName ?? metadata.title ?? "",
      createdAt: metadata.createdAt ?? now,
      updatedAt: metadata.updatedAt ?? now,
    };
  };

  return {
    create: (cwd) => load(sdk.SessionManager.create(cwd), cwd),
    async list(cwd) {
      return (await sdk.SessionManager.list(cwd)).map((info) => ({
        sessionId: String(info.id ?? info.sessionId ?? ""),
        cwd: typeof info.cwd === "string" && info.cwd ? info.cwd : cwd,
        title:
          (typeof info.name === "string" && info.name) ||
          (isRecord(info.firstMessage) &&
          typeof info.firstMessage.text === "string"
            ? info.firstMessage.text.trim()
            : typeof info.firstMessage === "string"
              ? info.firstMessage.trim()
              : ""),
        path: typeof info.path === "string" ? info.path : undefined,
        createdAt: dateValue(info.created) ?? Date.now(),
        updatedAt:
          dateValue(info.modified) ?? dateValue(info.created) ?? Date.now(),
      }));
    },
    async resolveDeleteTarget(cwd, sessionId) {
      const matches = (await sdk.SessionManager.list(cwd)).filter(
        (info) => String(info.id ?? info.sessionId ?? "") === sessionId,
      );
      if (matches.length === 0) return undefined;
      if (matches.length !== 1) throw new Error("Duplicate session ID");
      const raw = matches[0];
      if (typeof raw.cwd !== "string" || !raw.cwd)
        throw new Error("Session cwd is unavailable");
      if (typeof raw.path !== "string" || !raw.path)
        throw new Error("Session path is unavailable");
      return {
        info: {
          sessionId,
          cwd: raw.cwd,
          title: typeof raw.name === "string" ? raw.name : "",
          path: raw.path,
          createdAt: dateValue(raw.created) ?? Date.now(),
          updatedAt:
            dateValue(raw.modified) ?? dateValue(raw.created) ?? Date.now(),
        },
        sessionRoot: sdk.SessionManager.create(cwd).getSessionDir(),
      };
    },
    async openById(cwd, sessionId) {
      const discoveredPath = sdk.SessionManager.findById(cwd, sessionId);
      if (!discoveredPath) return undefined;
      const [sessionPath, sessionRoot] = await Promise.all([
        realpath(discoveredPath),
        realpath(sdk.SessionManager.create(cwd).getSessionDir()),
      ]);
      if (
        !(await stat(sessionPath)).isFile() ||
        !(await stat(sessionRoot)).isDirectory() ||
        !isWithin(sessionRoot, sessionPath)
      )
        throw new Error("Session path is unavailable");
      const sessionManager = sdk.SessionManager.open(sessionPath, sessionRoot);
      const [sessionCwd, requestedCwd] = await Promise.all([
        realpath(sessionManager.getCwd()),
        realpath(cwd),
      ]);
      if (sessionCwd !== requestedCwd)
        throw new Error("Session belongs to another worktree");
      const record = await load(sessionManager, cwd);
      if (record.sessionId !== sessionId) {
        await record.session.dispose();
        throw new Error("Agent SDK opened an unexpected session");
      }
      return record;
    },
    async open(info, cwd) {
      if (!info.path) throw new Error("Session path is unavailable");
      return load(
        sdk.SessionManager.open(info.path, undefined, cwd),
        cwd,
        info,
      );
    },
  };
}

async function loadDefaultResources(cwd: string) {
  await bootstrapArkApiKeyFromLoginShell();
  const settings = await loadSpireSettings();
  const resources = await resolveSpireResources(cwd);
  const spirecodePaths = new Set(
    resources.extensions
      .filter(({ layer }) => layer === "spirecode")
      .map(({ path }) => path),
  );
  return {
    settingsManager: settings.settingsManager,
    resourceLoaderOptions: {
      noExtensions: true,
      noSkills: true,
      noPromptTemplates: true,
      noThemes: true,
      additionalExtensionPaths: resources.extensions
        .filter(({ enabled }) => enabled)
        .map(({ path }) => path),
      additionalSkillPaths: resources.skills
        .filter(({ enabled }) => enabled)
        .map(({ path }) => path),
      additionalPromptTemplatePaths: resources.prompts
        .filter(({ enabled }) => enabled)
        .map(({ path }) => path),
      additionalThemePaths: resources.themes
        .filter(({ enabled }) => enabled)
        .map(({ path }) => path),
      extensionsOverride: (result: LoadExtensionsResult) =>
        assertNoExtensionConflicts(
          preferSpirecodeProviders(result, spirecodePaths),
        ),
    },
    diagnostics: [],
  };
}

export function preferSpirecodeProviders(
  result: LoadExtensionsResult,
  spirecodePaths: ReadonlySet<string>,
): LoadExtensionsResult {
  const spirecodeProviderNames = new Set([
    ...result.runtime.pendingProviderRegistrations
      .filter(({ extensionPath }) => spirecodePaths.has(extensionPath))
      .map(({ name }) => name),
    ...result.runtime.pendingNativeProviderRegistrations
      .filter(({ extensionPath }) => spirecodePaths.has(extensionPath))
      .map(({ provider }) => provider.id),
  ]);
  result.runtime.pendingProviderRegistrations =
    result.runtime.pendingProviderRegistrations.filter(
      ({ extensionPath, name }) =>
        spirecodePaths.has(extensionPath) || !spirecodeProviderNames.has(name),
    );
  result.runtime.pendingNativeProviderRegistrations =
    result.runtime.pendingNativeProviderRegistrations.filter(
      ({ extensionPath, provider }) =>
        spirecodePaths.has(extensionPath) ||
        !spirecodeProviderNames.has(provider.id),
    );
  return result;
}

function assertNoExtensionConflicts(
  result: LoadExtensionsResult,
): LoadExtensionsResult {
  if (result.errors.length > 0) {
    throw new Error(
      `Unable to load SpireCode extensions: ${result.errors
        .map((error) => `${error.path}: ${error.error}`)
        .join("; ")}`,
    );
  }
  assertUniqueRegistrations(result.extensions, "tools");
  assertUniqueRegistrations(result.extensions, "commands");
  assertUniqueOwners("Provider", [
    ...result.runtime.pendingProviderRegistrations.map((entry) => ({
      name: entry.name,
      path: entry.extensionPath,
    })),
    ...result.runtime.pendingNativeProviderRegistrations.map((entry) => ({
      name: entry.provider.id,
      path: entry.extensionPath,
    })),
  ]);
  return result;
}

function assertUniqueRegistrations(
  extensions: Extension[],
  kind: "tools" | "commands",
): void {
  assertUniqueOwners(
    kind === "tools" ? "Tool" : "Command",
    extensions.flatMap((extension) =>
      [...extension[kind].keys()].map((name) => ({
        name,
        path: extension.resolvedPath,
      })),
    ),
  );
}

function assertUniqueOwners(
  label: string,
  registrations: Array<{ name: string; path: string }>,
): void {
  const owners = new Map<string, string>();
  for (const registration of registrations) {
    const owner = owners.get(registration.name);
    if (owner) {
      throw new Error(
        `${label} ${registration.name} is registered by ${owner} and ${registration.path}`,
      );
    }
    owners.set(registration.name, registration.path);
  }
}

function assertResourcesLoaded(services: PiServices): void {
  const errors = (services.diagnostics ?? [])
    .filter((diagnostic) => diagnostic.type === "error")
    .map((diagnostic) => diagnostic.message);
  if (errors.length > 0) {
    throw new Error(
      `Unable to load SpireCode extensions: ${errors.join("; ")}`,
    );
  }
}

async function configuredDefaultModel(services: PiServices): Promise<unknown> {
  const provider = services.settingsManager.getDefaultProvider();
  const modelId = services.settingsManager.getDefaultModel();
  if (provider && modelId) {
    const model = services.modelRuntime.getModel(provider, modelId);
    if (model && services.modelRuntime.hasConfiguredAuth(provider))
      return model;
    const fallback = (await services.modelRuntime.getAvailable())
      .filter(isPiModel)
      .find((candidate) =>
        services.modelRuntime.hasConfiguredAuth(candidate.provider),
      );
    if (fallback) return fallback;
    throw new Error(
      `Configured default model ${provider}/${modelId} is unavailable`,
    );
  }
  return undefined;
}

function acceptPrompt(
  session: AgentSession,
  text: string,
  streamingBehavior: "followUp" | undefined,
): Promise<void> {
  return new Promise((resolve, reject) => {
    let accepted = false;
    const run = session.prompt(text, {
      expandPromptTemplates: true,
      ...(streamingBehavior ? { streamingBehavior } : {}),
      preflightResult(success) {
        if (success) {
          accepted = true;
          resolve();
        } else {
          reject(new Error("Prompt was rejected"));
        }
      },
    });
    void run.catch((error: unknown) => {
      if (!accepted) reject(error);
    });
  });
}

function isPiModel(value: unknown): value is PiModel {
  return (
    isRecord(value) &&
    typeof value.provider === "string" &&
    typeof value.id === "string"
  );
}

function normalizeCommand(value: unknown): ChatSlashCommand | undefined {
  if (
    !isRecord(value) ||
    typeof value.name !== "string" ||
    (value.source !== "extension" &&
      value.source !== "prompt" &&
      value.source !== "skill")
  )
    return undefined;
  return {
    name: value.name,
    ...(typeof value.description === "string"
      ? { description: value.description }
      : {}),
    source: value.source,
  };
}

function dateValue(value: unknown): number | undefined {
  if (value instanceof Date) return value.getTime();
  return typeof value === "number" && Number.isFinite(value)
    ? value
    : undefined;
}

function isWithin(root: string, candidate: string): boolean {
  const relative = path.relative(root, candidate);
  return (
    relative === "" ||
    (!relative.startsWith(`..${path.sep}`) &&
      relative !== ".." &&
      !path.isAbsolute(relative))
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
