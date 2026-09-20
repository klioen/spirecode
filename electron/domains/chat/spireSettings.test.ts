import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  loadSpireSettings,
  resolveSpireExtensions,
  resolveSpireResources,
} from "./spireSettings.js";

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
        packages: [
          "npm:pi-provider",
          {
            source: "./pi-package",
            autoload: false,
            extensions: ["provider.ts"],
          },
        ],
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
    expect(result.settingsManager.isProjectTrusted()).toBe(false);
    expect(result.settingsManager.getPackages()).toEqual([
      "npm:pi-provider",
      {
        source: path.join(root, ".pi", "agent", "pi-package"),
        autoload: false,
        extensions: ["provider.ts"],
      },
      "npm:spire-provider",
    ]);
    expect(result.settingsManager.getExtensionPaths()).toEqual([
      path.join(root, ".pi", "agent", "pi-extension.ts"),
      path.join(root, ".spirecode", "spire-extension.ts"),
    ]);
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

  it("does not load auto-discovered extensions that are absent from settings", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "spire-settings-"));
    const piSettingsPath = path.join(root, ".pi", "agent", "settings.json");
    const spireSettingsPath = path.join(root, ".spirecode", "settings.json");
    const autoExtension = path.join(
      path.dirname(piSettingsPath),
      "extensions",
      "auto.ts",
    );
    await mkdir(path.dirname(autoExtension), { recursive: true });
    await writeFile(autoExtension, "export default () => {};");

    await expect(
      resolveSpireExtensions(root, { piSettingsPath, spireSettingsPath }),
    ).resolves.toEqual([]);
  });

  it("keeps explicitly declared package skills while excluding auto-discovered skills", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "spire-settings-"));
    const piSettingsPath = path.join(root, ".pi", "agent", "settings.json");
    const spireSettingsPath = path.join(root, ".spirecode", "settings.json");
    const packageRoot = path.join(root, "skill-package");
    const explicitSkill = path.join(
      packageRoot,
      "skills",
      "explicit",
      "SKILL.md",
    );
    const autoSkill = path.join(
      path.dirname(piSettingsPath),
      "skills",
      "auto",
      "SKILL.md",
    );
    await mkdir(path.dirname(explicitSkill), { recursive: true });
    await mkdir(path.dirname(autoSkill), { recursive: true });
    await writeFile(
      path.join(packageRoot, "package.json"),
      JSON.stringify({
        name: "skill-package",
        version: "1.0.0",
        pi: { skills: ["./skills"] },
      }),
    );
    await writeFile(
      explicitSkill,
      "---\nname: explicit\ndescription: test\n---\n",
    );
    await writeFile(autoSkill, "---\nname: auto\ndescription: test\n---\n");
    await mkdir(path.dirname(piSettingsPath), { recursive: true });
    await writeFile(
      piSettingsPath,
      JSON.stringify({ packages: [packageRoot] }),
    );

    const resources = await resolveSpireResources(root, {
      piSettingsPath,
      spireSettingsPath,
    });

    expect(resources.skills.map(({ path }) => path)).toContain(explicitSkill);
    expect(resources.skills.map(({ path }) => path)).not.toContain(autoSkill);
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
      JSON.stringify({ packages: [{ autoload: false }] }),
    );
    await expect(
      loadSpireSettings({
        piSettingsPath: path.join(root, "missing-pi.json"),
        spireSettingsPath,
      }),
    ).rejects.toThrow(
      `${spireSettingsPath}: packages must contain strings or package declarations`,
    );
  });
});
