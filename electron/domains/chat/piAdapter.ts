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
  assertNoExtensionConflicts,
  defaultBundleRoot,
  resolveBundledResources,
} from "./bundledResources.js";
import { loadSpireSettings } from "./spireSettings.js";

export interface PiSession {
  readonly sessionId: string;
  readonly name?: string;
  readonly isStreaming: boolean;
  subscribe(listener: (event: unknown) => void): () => void;
  getMessages(): Promise<unknown[]>;
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

interface PiModelRuntime {
  getModel(provider: string, modelId: string): unknown;
  hasConfiguredAuth(provider: string): boolean;
}

export interface PiSettingsManager {
  getDefaultProvider(): string | undefined;
  getDefaultModel(): string | undefined;
}

interface PiSessionManager {
  buildSessionContext(): { messages: unknown[] };
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
  }): Promise<{ session: AgentSession }>;
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

  const wrap = (session: AgentSession): PiSession => ({
    sessionId: session.sessionId,
    name: session.sessionName,
    get isStreaming() {
      return session.isStreaming;
    },
    subscribe: (listener) =>
      session.subscribe(listener as (event: AgentSessionEvent) => void),
    getMessages: async () => session.messages,
    send: (text) =>
      acceptPrompt(session, text, session.isStreaming ? "followUp" : undefined),
    followUp: (text) => session.followUp(text),
    clearQueue: () => session.clearQueue(),
    abort: () => session.abort(),
    dispose: () => session.dispose(),
  });

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
    const { session } = await sdk.createAgentSessionFromServices({
      services,
      sessionManager,
      model,
    });
    const now = Date.now();
    return {
      session: wrap(session),
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
  const settings = await loadSpireSettings();
  const bundled = await resolveBundledResources({
    bundleRoot: defaultBundleRoot(),
    settingsPath: settings.settingsPath,
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
      extensionsOverride: assertNoExtensionConflicts,
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

function dateValue(value: unknown): number | undefined {
  if (value instanceof Date) return value.getTime();
  return typeof value === "number" && Number.isFinite(value)
    ? value
    : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
