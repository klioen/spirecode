import { homedir } from "node:os";
import {
  ModelRuntime,
  createAgentSessionServices,
} from "@earendil-works/pi-coding-agent";
import { CommandError } from "../../core/errors.js";
import type { ChatModelOption } from "../chat/types.js";
import { loadSpireSettings } from "../chat/spireSettings.js";
import { bootstrapArkApiKeyFromLoginShell } from "../chat/shellEnvironment.js";

interface ModelRef {
  provider: string;
  id: string;
}

interface CatalogRuntime {
  getAvailable(): Promise<readonly unknown[]>;
}

type RuntimeFactory = (extensionPaths?: string[]) => Promise<CatalogRuntime>;

export class ModelCatalogService {
  private runtime?: CatalogRuntime;
  private initializing?: Promise<CatalogRuntime>;

  constructor(
    private readonly initialize: RuntimeFactory = createCatalogRuntime,
  ) {}

  async list(extensionPaths: string[] = []): Promise<ChatModelOption[]> {
    const runtime = await this.getRuntime(extensionPaths);
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

  private async getRuntime(
    extensionPaths: string[] = [],
  ): Promise<CatalogRuntime> {
    if (extensionPaths.length === 0 && this.runtime) return this.runtime;
    this.initializing ??= this.initialize(extensionPaths);
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

async function createCatalogRuntime(
  extensionPaths: string[] = [],
): Promise<CatalogRuntime> {
  await bootstrapArkApiKeyFromLoginShell();
  const modelRuntime = await ModelRuntime.create();
  if (extensionPaths.length === 0)
    return modelRuntime as unknown as CatalogRuntime;
  const settings = await loadSpireSettings();
  const services = await createAgentSessionServices({
    cwd: homedir(),
    modelRuntime,
    settingsManager: settings.settingsManager,
    resourceLoaderOptions: {
      noExtensions: true,
      additionalExtensionPaths: extensionPaths,
    },
  });
  if ((services.diagnostics ?? []).some((entry) => entry.type === "error"))
    throw new CommandError("CHAT_FAILED", "Unable to initialize model catalog");
  return services.modelRuntime as unknown as CatalogRuntime;
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
