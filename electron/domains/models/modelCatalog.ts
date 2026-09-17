import { createRequire } from "node:module";
import { homedir } from "node:os";
import path from "node:path";
import {
  ModelRuntime,
  SettingsManager,
  createAgentSessionServices,
} from "@earendil-works/pi-coding-agent";
import { CommandError } from "../../core/errors.js";
import type { ChatModelOption } from "../chat/types.js";

interface ModelRef {
  provider: string;
  id: string;
}

interface CatalogRuntime {
  getAvailable(): Promise<readonly unknown[]>;
}

type RuntimeFactory = () => Promise<CatalogRuntime>;

export class ModelCatalogService {
  private runtime?: CatalogRuntime;
  private initializing?: Promise<CatalogRuntime>;

  constructor(
    private readonly initialize: RuntimeFactory = createCatalogRuntime,
  ) {}

  async list(): Promise<ChatModelOption[]> {
    const runtime = await this.getRuntime();
    try {
      return (await runtime.getAvailable())
        .filter(isModel)
        .map((model) => ({
          provider: model.provider,
          id: model.id,
          label: model.name || model.id,
          reasoning: model.reasoning === true,
        }))
        .sort((left, right) =>
          `${left.provider}/${left.id}`.localeCompare(
            `${right.provider}/${right.id}`,
          ),
        );
    } catch {
      throw new CommandError("CHAT_FAILED", "Unable to load available models");
    }
  }

  async assertAvailable(models: ModelRef[]): Promise<void> {
    const available = new Set(
      (await this.list()).map(({ provider, id }) => `${provider}\0${id}`),
    );
    for (const model of models) {
      if (!available.has(`${model.provider}\0${model.id}`))
        throw new CommandError(
          "CHAT_MODEL_UNAVAILABLE",
          `Model ${model.provider}/${model.id} is unavailable`,
        );
    }
  }

  private async getRuntime(): Promise<CatalogRuntime> {
    if (this.runtime) return this.runtime;
    this.initializing ??= this.initialize();
    try {
      this.runtime = await this.initializing;
      return this.runtime;
    } catch {
      throw new CommandError(
        "CHAT_FAILED",
        "Unable to initialize model catalog",
      );
    } finally {
      this.initializing = undefined;
    }
  }
}

async function createCatalogRuntime(): Promise<CatalogRuntime> {
  const modelRuntime = await ModelRuntime.create({ modelsPath: null });
  const providerExtension = resolveTraexProviderExtension();
  if (providerExtension) {
    const services = await createAgentSessionServices({
      cwd: homedir(),
      modelRuntime,
      settingsManager: SettingsManager.inMemory({}, { projectTrusted: true }),
      resourceLoaderOptions: {
        noExtensions: true,
        additionalExtensionPaths: [providerExtension],
      },
    });
    const errors = (services.diagnostics ?? []).filter(
      (entry) => entry.type === "error",
    );
    const extensionErrors = services.resourceLoader.getExtensions().errors;
    if (errors.length > 0 || extensionErrors.length > 0)
      throw new CommandError(
        "CHAT_FAILED",
        "Unable to initialize model catalog",
      );
  }
  return modelRuntime as unknown as CatalogRuntime;
}

function resolveTraexProviderExtension(): string | undefined {
  const searchRoot = path.join(
    homedir(),
    ".pi",
    "agent",
    "npm",
    "node_modules",
  );
  try {
    return createRequire(import.meta.url).resolve(
      "@bytedance-dev/pi-provider-traex",
      {
        paths: [searchRoot],
      },
    );
  } catch {
    return undefined;
  }
}

function isModel(value: unknown): value is {
  provider: string;
  id: string;
  name?: string;
  reasoning?: boolean;
} {
  if (!value || typeof value !== "object") return false;
  const model = value as Record<string, unknown>;
  return (
    typeof model.provider === "string" &&
    Boolean(model.provider) &&
    typeof model.id === "string" &&
    Boolean(model.id)
  );
}
