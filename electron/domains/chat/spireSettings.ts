import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";
import { SettingsManager } from "@earendil-works/pi-coding-agent";

export type SettingsLayer = "pi" | "spirecode";

export interface SettingsResourceSource {
  source: string;
  settingsPath: string;
  layer: SettingsLayer;
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

export async function loadSpireSettings(
  paths: SpireSettingsPaths = {},
): Promise<SpireSettingsResult> {
  const piSettingsPath =
    paths.piSettingsPath ??
    path.join(homedir(), ".pi", "agent", "settings.json");
  const spireSettingsPath =
    paths.spireSettingsPath ??
    path.join(homedir(), ".spirecode", "settings.json");
  const piSettings = await readSettings(piSettingsPath, "Pi");
  const spireSettings = await readSettings(spireSettingsPath, "SpireCode");
  const packageSources = [
    ...resourceSources(piSettings, "packages", piSettingsPath, "pi"),
    ...resourceSources(
      spireSettings,
      "packages",
      spireSettingsPath,
      "spirecode",
    ),
  ];
  const extensionSources = [
    ...resourceSources(piSettings, "extensions", piSettingsPath, "pi"),
    ...resourceSources(
      spireSettings,
      "extensions",
      spireSettingsPath,
      "spirecode",
    ),
  ];
  const merged = deepMerge(piSettings, spireSettings);
  delete merged.packages;
  delete merged.extensions;

  return {
    settingsManager: SettingsManager.inMemory(
      merged as Parameters<typeof SettingsManager.inMemory>[0],
      {
        projectTrusted: true,
      },
    ),
    packageSources,
    extensionSources,
  };
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
  if (
    !Array.isArray(value) ||
    value.some((entry) => typeof entry !== "string")
  ) {
    throw new Error(`${settingsPath}: ${field} must be an array of strings`);
  }
  return value.map((source) => ({ source, settingsPath, layer }));
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
