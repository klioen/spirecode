import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";
import { SettingsManager } from "@earendil-works/pi-coding-agent";

export interface SpireSettingsResult {
  settingsManager: SettingsManager;
  packageSources: string[];
  extensionSources: string[];
  settingsPath: string;
}

export async function loadSpireSettings(
  settingsPath = path.join(homedir(), ".spirecode", "settings.json"),
): Promise<SpireSettingsResult> {
  let parsed: Record<string, unknown> = {};
  try {
    const value = JSON.parse(await readFile(settingsPath, "utf8"));
    if (!isRecord(value)) throw new Error("settings root must be an object");
    parsed = value;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
      throw new Error(`Unable to load SpireCode settings: ${message(error)}`, {
        cause: error,
      });
    }
  }

  const packageSources = stringArray(parsed.packages, "packages");
  const extensionSources = stringArray(parsed.extensions, "extensions");
  const settings = { ...parsed };
  delete settings.packages;
  delete settings.extensions;

  return {
    settingsManager: SettingsManager.inMemory(settings, {
      projectTrusted: true,
    }),
    packageSources,
    extensionSources,
    settingsPath,
  };
}

function stringArray(value: unknown, field: string): string[] {
  if (value === undefined) return [];
  if (
    !Array.isArray(value) ||
    value.some((entry) => typeof entry !== "string")
  ) {
    throw new Error(
      `SpireCode settings ${field} must be an array of local paths`,
    );
  }
  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
