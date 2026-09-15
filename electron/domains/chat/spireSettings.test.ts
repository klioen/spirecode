import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { loadSpireSettings } from "./spireSettings.js";

describe("loadSpireSettings", () => {
  it("loads only the explicit SpireCode settings file", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "spire-settings-"));
    const settingsPath = path.join(root, ".spirecode", "settings.json");
    await mkdir(path.dirname(settingsPath), { recursive: true });
    await writeFile(
      settingsPath,
      JSON.stringify({
        defaultProvider: "custom",
        defaultModel: "model",
        packages: ["./extensions/example"],
        extensions: ["./single.ts"],
      }),
    );

    const result = await loadSpireSettings(settingsPath);

    expect(result.settingsManager.getDefaultProvider()).toBe("custom");
    expect(result.settingsManager.getDefaultModel()).toBe("model");
    expect(result.settingsManager.getPackages()).toEqual([]);
    expect(result.settingsManager.getExtensionPaths()).toEqual([]);
    expect(result.packageSources).toEqual(["./extensions/example"]);
    expect(result.extensionSources).toEqual(["./single.ts"]);
  });

  it("uses empty settings when the file does not exist", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "spire-settings-"));
    const result = await loadSpireSettings(path.join(root, "missing.json"));
    expect(result.packageSources).toEqual([]);
    expect(result.extensionSources).toEqual([]);
  });

  it("rejects non-local source shapes", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "spire-settings-"));
    const settingsPath = path.join(root, "settings.json");
    await writeFile(
      settingsPath,
      JSON.stringify({ packages: [{ source: "x" }] }),
    );
    await expect(loadSpireSettings(settingsPath)).rejects.toThrow(
      "packages must be an array of local paths",
    );
  });
});
