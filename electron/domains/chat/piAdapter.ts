import type {
  AgentSession,
  AgentSessionEvent,
  LoadExtensionsResult,
} from "@earendil-works/pi-coding-agent";
import {
  ModelRuntime,
  SessionManager,
  createAgentSessionFromServices,
  createAgentSessionServices,
} from "@earendil-works/pi-coding-agent";
import {
  applyExtensionPrecedence,
  assertNoExtensionConflicts,
  defaultBundleRoot,
  resolveBundledResources,
} from "./bundledResources.js";
import { bootstrapArkApiKeyFromLoginShell } from "./shellEnvironment.js";
import { loadSpireSettings } from "./spireSettings.js";
import type {
  ChatSessionConfig,
  ChatSlashCommand,
  ChatThinkingLevel,
} from "./types.js";

export interface PiSession {
  readonly sessionId: string;
  readonly name?: string;
  readonly isStreaming: boolean;
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
  getBranch(): unknown[];
}

interface PiServices {
  modelRuntime: PiModelRuntime;
  settingsManager: PiSettingsManager;
  diagnostics?: Array<{ type: "info" | "warning" | "error"; message: string }>;
}

interface PiResourceLoaderOptions {
  noExtensions: boolean;
  additionalExtensionPaths: string[];
  extensionsOverride?: (result: LoadExtensionsResult) => LoadExtensionsResult;
}

export interface PiSdk {
  ModelRuntime: { create(): Promise<PiModelRuntime> };
  SessionManager: {
    create(cwd: string): PiSessionManager;
    list(cwd: string): Promise<Array<Record<string, unknown>>>;
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
    runtimeCommands: () => unknown[],
  ): PiSession => {
    const getConfig = async (): Promise<ChatSessionConfig> => {
      const models = (await modelRuntime.getAvailable())
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
      subscribe: (listener) =>
        session.subscribe(listener as (event: AgentSessionEvent) => void),
      getMessages: async () => session.messages,
      getEntries: async () => sessionManager.getBranch(),
      getConfig,
      async setModel(provider, modelId) {
        const model = (await modelRuntime.getAvailable()).find(
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
      : configuredDefaultModel(services);
    const created = await sdk.createAgentSessionFromServices({
      services,
      sessionManager,
      model,
    });
    const { session } = created;
    const now = Date.now();
    return {
      session: wrap(
        session,
        sessionManager,
        () => created.extensionsResult?.runtime?.getCommands() ?? [],
      ),
      sessionId: session.sessionId,
      cwd,
      title: session.sessionName ?? metadata.title ?? "New chat",
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
              : "") ||
          "New chat",
        path: typeof info.path === "string" ? info.path : undefined,
        createdAt: dateValue(info.created) ?? Date.now(),
        updatedAt:
          dateValue(info.modified) ?? dateValue(info.created) ?? Date.now(),
      }));
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

async function loadDefaultResources() {
  await bootstrapArkApiKeyFromLoginShell();
  const settings = await loadSpireSettings();
  const bundled = await resolveBundledResources({
    bundleRoot: defaultBundleRoot(),
    packageSources: settings.packageSources,
    extensionSources: settings.extensionSources,
  });
  for (const diagnostic of bundled.diagnostics) {
    console.warn(`[spirecode:extensions] ${diagnostic}`);
  }
  return {
    settingsManager: settings.settingsManager,
    resourceLoaderOptions: {
      noExtensions: true,
      additionalExtensionPaths: bundled.paths,
      extensionsOverride: (result: LoadExtensionsResult) =>
        assertNoExtensionConflicts(
          applyExtensionPrecedence(result, bundled.spirecodeSources),
        ),
    },
    diagnostics: bundled.diagnostics,
  };
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

function configuredDefaultModel(services: PiServices): unknown {
  const provider = services.settingsManager.getDefaultProvider();
  const modelId = services.settingsManager.getDefaultModel();
  if (!provider || !modelId) return undefined;
  const model = services.modelRuntime.getModel(provider, modelId);
  if (!model || !services.modelRuntime.hasConfiguredAuth(provider)) {
    throw new Error(
      `Configured default model ${provider}/${modelId} is unavailable`,
    );
  }
  return model;
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
