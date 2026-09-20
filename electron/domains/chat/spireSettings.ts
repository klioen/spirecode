import { readFile, realpath } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";
import {
  DefaultPackageManager,
  SettingsManager,
  type PackageSource,
  type ResolvedResource,
} from "@earendil-works/pi-coding-agent";

export type SettingsLayer = "pi" | "spirecode";

export interface SettingsResourceSource {
  source: string;
  settingsPath: string;
  layer: SettingsLayer;
}

export interface LayeredExtensionResource extends ResolvedResource {
  layer: SettingsLayer;
}

export interface SpireResolvedResources {
  extensions: LayeredExtensionResource[];
  skills: ResolvedResource[];
  prompts: ResolvedResource[];
  themes: ResolvedResource[];
}

export interface SpireSettingsResult {
  settingsManager: SettingsManager;
  packageSources: SettingsResourceSource[];
  extensionSources: SettingsResourceSource[];
}

export interface SpireSettingsPaths {
  piSettingsPath?: string;
  spireSettingsPath?: string;
}

interface LoadedSettings {
  piSettingsPath: string;
  spireSettingsPath: string;
  piSettings: Record<string, unknown>;
  spireSettings: Record<string, unknown>;
}

export async function loadSpireSettings(
  paths: SpireSettingsPaths = {},
): Promise<SpireSettingsResult> {
  const loaded = await loadSettingsFiles(paths);
  const packageSources = [
    ...resourceSources(
      loaded.piSettings,
      "packages",
      loaded.piSettingsPath,
      "pi",
    ),
    ...resourceSources(
      loaded.spireSettings,
      "packages",
      loaded.spireSettingsPath,
      "spirecode",
    ),
  ];
  const extensionSources = [
    ...resourceSources(
      loaded.piSettings,
      "extensions",
      loaded.piSettingsPath,
      "pi",
    ),
    ...resourceSources(
      loaded.spireSettings,
      "extensions",
      loaded.spireSettingsPath,
      "spirecode",
    ),
  ];
  const merged = deepMerge(loaded.piSettings, loaded.spireSettings);
  merged.packages = [
    ...packageDeclarations(loaded.piSettings, loaded.piSettingsPath),
    ...packageDeclarations(loaded.spireSettings, loaded.spireSettingsPath),
  ];
  merged.extensions = [
    ...extensionDeclarations(loaded.piSettings, loaded.piSettingsPath),
    ...extensionDeclarations(loaded.spireSettings, loaded.spireSettingsPath),
  ];

  return {
    settingsManager: SettingsManager.inMemory(
      merged as Parameters<typeof SettingsManager.inMemory>[0],
      { projectTrusted: false },
    ),
    packageSources,
    extensionSources,
  };
}

export async function resolveSpireResources(
  cwd: string,
  paths: SpireSettingsPaths = {},
): Promise<SpireResolvedResources> {
  const loaded = await loadSettingsFiles(paths);
  const [pi, spirecode] = await Promise.all([
    resolveLayerResources(cwd, loaded.piSettings, loaded.piSettingsPath, "pi"),
    resolveLayerResources(
      cwd,
      loaded.spireSettings,
      loaded.spireSettingsPath,
      "spirecode",
    ),
  ]);
  return {
    extensions: await mergeResources(pi.extensions, spirecode.extensions),
    skills: await mergeResources(pi.skills, spirecode.skills),
    prompts: await mergeResources(pi.prompts, spirecode.prompts),
    themes: await mergeResources(pi.themes, spirecode.themes),
  };
}

export async function resolveSpireExtensions(
  cwd: string,
  paths: SpireSettingsPaths = {},
): Promise<LayeredExtensionResource[]> {
  return (await resolveSpireResources(cwd, paths)).extensions;
}

export async function resolveSpireExtensionPaths(
  cwd: string,
  paths: SpireSettingsPaths = {},
): Promise<string[]> {
  return (await resolveSpireExtensions(cwd, paths))
    .filter((resource) => resource.enabled)
    .map((resource) => resource.path);
}

async function resolveLayerResources(
  cwd: string,
  settings: Record<string, unknown>,
  settingsPath: string,
  layer: SettingsLayer,
) {
  const normalized = { ...settings };
  normalized.packages = packageDeclarations(settings, settingsPath);
  normalized.extensions = extensionDeclarations(settings, settingsPath);
  const manager = new DefaultPackageManager({
    cwd,
    agentDir: path.dirname(settingsPath),
    settingsManager: SettingsManager.inMemory(
      normalized as Parameters<typeof SettingsManager.inMemory>[0],
      { projectTrusted: false },
    ),
  });
  const resolved = await manager.resolve(async () => "skip");
  const explicit = (resources: ResolvedResource[]) =>
    resources.filter(
      (resource) =>
        resource.metadata.source !== "auto" &&
        resource.metadata.scope !== "project",
    );
  return {
    extensions: explicit(resolved.extensions).map((resource) => ({
      ...resource,
      layer,
    })),
    skills: explicit(resolved.skills),
    prompts: explicit(resolved.prompts),
    themes: explicit(resolved.themes),
  };
}

async function mergeResources<T extends ResolvedResource>(
  base: T[],
  override: T[],
): Promise<T[]> {
  const unique = new Map<string, T>();
  for (const resource of [...base, ...override]) {
    unique.set(await canonicalResourceKey(resource.path), resource);
  }
  return [...unique.values()];
}

async function loadSettingsFiles(
  paths: SpireSettingsPaths,
): Promise<LoadedSettings> {
  const piSettingsPath =
    paths.piSettingsPath ??
    path.join(homedir(), ".pi", "agent", "settings.json");
  const spireSettingsPath =
    paths.spireSettingsPath ??
    path.join(homedir(), ".spirecode", "settings.json");
  return {
    piSettingsPath,
    spireSettingsPath,
    piSettings: await readSettings(piSettingsPath, "Pi"),
    spireSettings: await readSettings(spireSettingsPath, "SpireCode"),
  };
}

async function canonicalResourceKey(resourcePath: string): Promise<string> {
  try {
    return await realpath(resourcePath);
  } catch {
    return path.resolve(resourcePath);
  }
}

async function readSettings(
  settingsPath: string,
  label: string,
): Promise<Record<string, unknown>> {
  try {
    const value = JSON.parse(await readFile(settingsPath, "utf8"));
    if (!isRecord(value)) throw new Error("settings root must be an object");
    return value;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return {};
    throw new Error(
      `Unable to load ${label} settings ${settingsPath}: ${message(error)}`,
      { cause: error },
    );
  }
}

function resourceSources(
  settings: Record<string, unknown>,
  field: "packages" | "extensions",
  settingsPath: string,
  layer: SettingsLayer,
): SettingsResourceSource[] {
  const value = settings[field];
  if (value === undefined) return [];
  if (!Array.isArray(value)) {
    throw new Error(`${settingsPath}: ${field} must be an array`);
  }
  if (field === "extensions") {
    if (value.some((entry) => typeof entry !== "string")) {
      throw new Error(
        `${settingsPath}: extensions must be an array of strings`,
      );
    }
    return value.map((source) => ({
      source: source as string,
      settingsPath,
      layer,
    }));
  }
  if (value.some((entry) => !isPackageSource(entry))) {
    throw new Error(
      `${settingsPath}: packages must contain strings or package declarations`,
    );
  }
  return value.map((entry) => ({
    source: typeof entry === "string" ? entry : entry.source,
    settingsPath,
    layer,
  }));
}

function packageDeclarations(
  settings: Record<string, unknown>,
  settingsPath: string,
): PackageSource[] {
  const value = settings.packages;
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.some((entry) => !isPackageSource(entry))) {
    throw new Error(
      `${settingsPath}: packages must contain strings or package declarations`,
    );
  }
  return value.map((entry) => {
    if (typeof entry === "string")
      return resolveResourceSource(settingsPath, entry);
    return {
      ...entry,
      source: resolveResourceSource(settingsPath, entry.source),
    };
  });
}

function extensionDeclarations(
  settings: Record<string, unknown>,
  settingsPath: string,
): string[] {
  const value = settings.extensions;
  if (value === undefined) return [];
  if (
    !Array.isArray(value) ||
    value.some((entry) => typeof entry !== "string")
  ) {
    throw new Error(`${settingsPath}: extensions must be an array of strings`);
  }
  return value.map((entry) => resolveResourceSource(settingsPath, entry));
}

function resolveResourceSource(settingsPath: string, source: string): string {
  if (source === "~") return homedir();
  if (source.startsWith("~/")) return path.join(homedir(), source.slice(2));
  if (
    source.startsWith(".") ||
    source.startsWith("/") ||
    path.win32.isAbsolute(source)
  )
    return path.resolve(path.dirname(settingsPath), source);
  return source;
}

function isPackageSource(value: unknown): value is PackageSource {
  if (typeof value === "string") return true;
  if (!isRecord(value) || typeof value.source !== "string") return false;
  if (value.autoload !== undefined && typeof value.autoload !== "boolean")
    return false;
  return ["extensions", "skills", "prompts", "themes"].every(
    (field) =>
      value[field] === undefined ||
      (Array.isArray(value[field]) &&
        value[field].every((entry) => typeof entry === "string")),
  );
}

function deepMerge(
  base: Record<string, unknown>,
  override: Record<string, unknown>,
): Record<string, unknown> {
  const result = { ...base };
  for (const [key, value] of Object.entries(override)) {
    if (value === undefined) continue;
    const baseValue = result[key];
    result[key] =
      isRecord(baseValue) && isRecord(value)
        ? deepMerge(baseValue, value)
        : value;
  }
  return result;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
