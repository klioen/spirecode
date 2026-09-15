import { createHash } from "node:crypto";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  BUNDLED_PACKAGE_NAMES,
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

describe("resolveBundledResources", () => {
  it("always includes the complete bundled package set", async () => {
    const { bundleRoot, settingsPath } = await fixture();
    const result = await resolveBundledResources({
      bundleRoot,
      settingsPath,
      packageSources: [],
      extensionSources: [],
    });
    expect(result.paths.map((entry) => path.basename(entry))).toEqual(
      BUNDLED_PACKAGE_NAMES,
    );
    expect(result.diagnostics).toEqual([]);
  });

  it("rejects a user copy of a bundled package", async () => {
    const { root, bundleRoot, settingsPath } = await fixture();
    const source = await userPackage(root, "custom-memory", "pi-memory");
    const result = await resolveBundledResources({
      bundleRoot,
      settingsPath,
      packageSources: [source],
      extensionSources: [],
    });
    expect(result.paths).toHaveLength(BUNDLED_PACKAGE_NAMES.length);
    expect(result.diagnostics[0]).toContain("pi-memory is bundled");
  });

  it("loads a non-conflicting local package", async () => {
    const { root, bundleRoot, settingsPath } = await fixture();
    const source = await userPackage(root, "safe", "safe-extension");
    const result = await resolveBundledResources({
      bundleRoot,
      settingsPath,
      packageSources: [source],
      extensionSources: [],
    });
    expect(result.paths.at(-1)).toBe(source);
    expect(result.diagnostics).toEqual([]);
  });

  it("passes through remote packages but rejects a bundled npm identity", async () => {
    const { bundleRoot, settingsPath } = await fixture();
    const result = await resolveBundledResources({
      bundleRoot,
      settingsPath,
      packageSources: ["npm:example", "npm:pi-memory@0.2.0"],
      extensionSources: [],
    });
    expect(result.paths.at(-1)).toBe("npm:example");
    expect(result.diagnostics[0]).toContain("pi-memory is bundled");
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
