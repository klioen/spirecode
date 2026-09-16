import { createHash } from "node:crypto";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  BUNDLED_PACKAGE_NAMES,
  applyExtensionPrecedence,
  assertNoExtensionConflicts,
  resolveBundledResources,
} from "./bundledResources.js";

async function fixture() {
  const root = await mkdtemp(path.join(tmpdir(), "spire-resources-"));
  const bundleRoot = path.join(root, "bundle");
  const files: Record<string, string> = {};
  for (const name of BUNDLED_PACKAGE_NAMES) {
    await mkdir(path.join(bundleRoot, name), { recursive: true });
    const content = JSON.stringify({ name });
    await writeFile(path.join(bundleRoot, name, "package.json"), content);
    files[`${name}/package.json`] = createHash("sha256")
      .update(content)
      .digest("hex");
  }
  await writeFile(
    path.join(bundleRoot, "bundle-manifest.json"),
    JSON.stringify({
      packages: BUNDLED_PACKAGE_NAMES.map((name) => ({ name })),
      files,
    }),
  );
  const settingsPath = path.join(root, ".spirecode", "settings.json");
  return { root, bundleRoot, settingsPath };
}

async function userPackage(root: string, directory: string, name: string) {
  const packageRoot = path.join(root, directory);
  await mkdir(packageRoot, { recursive: true });
  await writeFile(
    path.join(packageRoot, "package.json"),
    JSON.stringify({ name }),
  );
  return packageRoot;
}

const source = (
  value: string,
  settingsPath: string,
  layer: "pi" | "spirecode" = "spirecode",
) => ({ source: value, settingsPath, layer });

describe("resolveBundledResources", () => {
  it("always includes the complete bundled package set", async () => {
    const { bundleRoot } = await fixture();
    const result = await resolveBundledResources({
      bundleRoot,
      packageSources: [],
      extensionSources: [],
    });
    expect(result.paths.map((entry) => path.basename(entry))).toEqual(
      BUNDLED_PACKAGE_NAMES,
    );
    expect(result.diagnostics).toEqual([]);
  });

  it("resolves relative resources against each owning settings file", async () => {
    const { root, bundleRoot, settingsPath } = await fixture();
    const piSettingsPath = path.join(root, ".pi", "agent", "settings.json");
    const piPackage = await userPackage(
      path.dirname(piSettingsPath),
      "pi-package",
      "pi-only",
    );
    const spireExtension = path.join(
      path.dirname(settingsPath),
      "spire-extension.ts",
    );
    await mkdir(path.dirname(spireExtension), { recursive: true });
    await writeFile(spireExtension, "export default () => {};");
    const result = await resolveBundledResources({
      bundleRoot,
      packageSources: [source("./pi-package", piSettingsPath, "pi")],
      extensionSources: [source("./spire-extension.ts", settingsPath)],
    });
    expect(result.paths.slice(-2)).toEqual([piPackage, spireExtension]);
    expect(result.spirecodeSources).toEqual(
      new Set(["./spire-extension.ts", spireExtension]),
    );
  });

  it("rejects a user copy of a bundled package", async () => {
    const { root, bundleRoot, settingsPath } = await fixture();
    const packagePath = await userPackage(root, "custom-memory", "pi-memory");
    const result = await resolveBundledResources({
      bundleRoot,
      packageSources: [source(packagePath, settingsPath)],
      extensionSources: [],
    });
    expect(result.paths).toHaveLength(BUNDLED_PACKAGE_NAMES.length);
    expect(result.diagnostics[0]).toContain("pi-memory is bundled");
  });

  it("loads a non-conflicting local package", async () => {
    const { root, bundleRoot, settingsPath } = await fixture();
    const packagePath = await userPackage(root, "safe", "safe-extension");
    const result = await resolveBundledResources({
      bundleRoot,
      packageSources: [source(packagePath, settingsPath)],
      extensionSources: [],
    });
    expect(result.paths.at(-1)).toBe(packagePath);
    expect(result.spirecodeSources).toEqual(new Set([packagePath]));
    expect(result.diagnostics).toEqual([]);
  });

  it("reuses installed npm packages from the pi agent directory", async () => {
    const { root, bundleRoot } = await fixture();
    const piSettingsPath = path.join(root, ".pi", "agent", "settings.json");
    const installed = await userPackage(
      path.join(
        path.dirname(piSettingsPath),
        "npm",
        "node_modules",
        "@private",
      ),
      "provider",
      "@private/provider",
    );
    const result = await resolveBundledResources({
      bundleRoot,
      packageSources: [source("npm:@private/provider", piSettingsPath, "pi")],
      extensionSources: [],
    });
    expect(result.paths.at(-1)).toBe(installed);
  });

  it("passes through remote packages but rejects a bundled npm identity", async () => {
    const { bundleRoot, settingsPath } = await fixture();
    const result = await resolveBundledResources({
      bundleRoot,
      packageSources: [
        source("npm:example", settingsPath, "pi"),
        source("npm:pi-memory@0.2.0", settingsPath),
      ],
      extensionSources: [],
    });
    expect(result.paths.at(-1)).toBe("npm:example");
    expect(result.diagnostics[0]).toContain("pi-memory is bundled");
  });

  it("lets a SpireCode provider replace the same pi provider", () => {
    const registration = (extensionPath: string) => ({
      name: "shared-provider",
      config: {},
      extensionPath,
    });
    const result = {
      extensions: [
        {
          resolvedPath: "/pi/provider.ts",
          sourceInfo: { source: "npm:pi-provider" },
          tools: new Map(),
          commands: new Map(),
        },
        {
          resolvedPath: "/spire/provider.ts",
          sourceInfo: { source: "npm:spire-provider" },
          tools: new Map(),
          commands: new Map(),
        },
      ],
      errors: [],
      runtime: {
        pendingProviderRegistrations: [
          registration("/pi/provider.ts"),
          registration("/spire/provider.ts"),
        ],
        pendingNativeProviderRegistrations: [],
      },
    } as never;

    const merged = applyExtensionPrecedence(
      result,
      new Set(["npm:spire-provider"]),
    );
    expect(merged.runtime.pendingProviderRegistrations).toEqual([
      registration("/spire/provider.ts"),
    ]);
    expect(() => assertNoExtensionConflicts(merged)).not.toThrow();
  });

  it("rejects actual duplicate registrations after a single extension load", () => {
    const extension = (resolvedPath: string) => ({
      resolvedPath,
      tools: new Map([["duplicate_tool", {}]]),
      commands: new Map(),
    });
    expect(() =>
      assertNoExtensionConflicts({
        extensions: [extension("first.ts"), extension("second.ts")],
        errors: [],
        runtime: {
          pendingProviderRegistrations: [],
          pendingNativeProviderRegistrations: [],
        },
      } as never),
    ).toThrow("Tool duplicate_tool is registered by first.ts and second.ts");
  });

  it("rejects extension loader errors before session creation", () => {
    expect(() =>
      assertNoExtensionConflicts({
        extensions: [],
        errors: [{ path: "broken.ts", error: "syntax error" }],
        runtime: {
          pendingProviderRegistrations: [],
          pendingNativeProviderRegistrations: [],
        },
      } as never),
    ).toThrow("Unable to load SpireCode extensions");
  });
});
