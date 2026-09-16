import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { loadSpireSettings } from "./spireSettings.js";

describe("loadSpireSettings", () => {
  it("deep-merges pi settings with SpireCode overrides and combines resources", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "spire-settings-"));
    const piSettingsPath = path.join(root, ".pi", "agent", "settings.json");
    const spireSettingsPath = path.join(root, ".spirecode", "settings.json");
    await mkdir(path.dirname(piSettingsPath), { recursive: true });
    await mkdir(path.dirname(spireSettingsPath), { recursive: true });
    await writeFile(
      piSettingsPath,
      JSON.stringify({
        defaultProvider: "pi-provider",
        defaultModel: "pi-model",
        retry: { enabled: true, provider: { timeoutMs: 1000, maxRetries: 2 } },
        packages: ["npm:pi-provider", "./pi-package"],
        extensions: ["./pi-extension.ts"],
      }),
    );
    await writeFile(
      spireSettingsPath,
      JSON.stringify({
        defaultProvider: "spire-provider",
        retry: { provider: { maxRetries: 5 } },
        packages: ["npm:spire-provider"],
        extensions: ["./spire-extension.ts"],
      }),
    );

    const result = await loadSpireSettings({
      piSettingsPath,
      spireSettingsPath,
    });

    expect(result.settingsManager.getDefaultProvider()).toBe("spire-provider");
    expect(result.settingsManager.getDefaultModel()).toBe("pi-model");
    expect(result.settingsManager.getProviderRetrySettings()).toMatchObject({
      timeoutMs: 1000,
      maxRetries: 5,
    });
    expect(result.settingsManager.getPackages()).toEqual([]);
    expect(result.settingsManager.getExtensionPaths()).toEqual([]);
    expect(result.packageSources).toEqual([
      { source: "npm:pi-provider", settingsPath: piSettingsPath, layer: "pi" },
      { source: "./pi-package", settingsPath: piSettingsPath, layer: "pi" },
      {
        source: "npm:spire-provider",
        settingsPath: spireSettingsPath,
        layer: "spirecode",
      },
    ]);
    expect(result.extensionSources).toEqual([
      {
        source: "./pi-extension.ts",
        settingsPath: piSettingsPath,
        layer: "pi",
      },
      {
        source: "./spire-extension.ts",
        settingsPath: spireSettingsPath,
        layer: "spirecode",
      },
    ]);
  });

  it("uses empty settings when neither file exists", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "spire-settings-"));
    const result = await loadSpireSettings({
      piSettingsPath: path.join(root, "missing-pi.json"),
      spireSettingsPath: path.join(root, "missing-spire.json"),
    });
    expect(result.packageSources).toEqual([]);
    expect(result.extensionSources).toEqual([]);
  });

  it("rejects invalid resource shapes with the owning settings path", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "spire-settings-"));
    const spireSettingsPath = path.join(root, "settings.json");
    await writeFile(
      spireSettingsPath,
      JSON.stringify({ packages: [{ source: "x" }] }),
    );
    await expect(
      loadSpireSettings({
        piSettingsPath: path.join(root, "missing-pi.json"),
        spireSettingsPath,
      }),
    ).rejects.toThrow(
      `${spireSettingsPath}: packages must be an array of strings`,
    );
  });
});
