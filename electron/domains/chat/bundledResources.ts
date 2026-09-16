import { createHash } from "node:crypto";
import { lstat, readFile, stat } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";
import type {
  Extension,
  LoadExtensionsResult,
} from "@earendil-works/pi-coding-agent";
import type { SettingsResourceSource } from "./spireSettings.js";

export const BUNDLED_PACKAGE_NAMES = [
  "pi-web-access",
  "pi-subagents",
  "pi-todo",
  "pi-plan",
  "pi-goal",
  "pi-failover",
  "pi-memory",
  "pi-sdlc",
] as const;

export interface BundledResourceOptions {
  bundleRoot: string;
  packageSources: SettingsResourceSource[];
  extensionSources: SettingsResourceSource[];
}

export interface BundledResourceResult {
  paths: string[];
  diagnostics: string[];
  spirecodeSources: Set<string>;
}

export function defaultBundleRoot(): string {
  return process.env.SPIRECODE_PI_EXTENSIONS_DIR
    ? path.resolve(process.env.SPIRECODE_PI_EXTENSIONS_DIR)
    : process.env.NODE_ENV === "development" || process.env.VITE_DEV_SERVER_URL
      ? path.resolve(".build/pi-extensions")
      : path.join(process.resourcesPath, "pi-extensions");
}

export async function resolveBundledResources(
  options: BundledResourceOptions,
): Promise<BundledResourceResult> {
  const piPaths: string[] = [];
  const spirecodePaths: string[] = [];
  const bundledPaths: string[] = [];
  const diagnostics: string[] = [];
  const spirecodeSources = new Set<string>();
  await verifyBundle(options.bundleRoot);
  for (const name of BUNDLED_PACKAGE_NAMES) {
    const packageRoot = path.join(options.bundleRoot, name);
    await verifyPackage(packageRoot, name);
    bundledPaths.push(packageRoot);
  }
  const addPath = (value: string, layer: "pi" | "spirecode") => {
    (layer === "pi" ? piPaths : spirecodePaths).push(value);
  };

  for (const entry of options.packageSources) {
    const { source, settingsPath, layer } = entry;
    try {
      if (isLocalPath(source)) {
        const resolved = resolveUserPath(path.dirname(settingsPath), source);
        const packageRoot = await findPackageRoot(resolved);
        const manifest = JSON.parse(
          await readFile(path.join(packageRoot, "package.json"), "utf8"),
        );
        if (BUNDLED_PACKAGE_NAMES.includes(manifest.name)) {
          diagnostics.push(
            `Ignored ${source}: package ${manifest.name} is bundled by SpireCode`,
          );
          continue;
        }
        addPath(resolved, layer);
        if (layer === "spirecode") {
          spirecodeSources.add(source);
          spirecodeSources.add(resolved);
        }
      } else if (bundledNpmPackage(source)) {
        diagnostics.push(
          `Ignored ${source}: package ${bundledNpmPackage(source)} is bundled by SpireCode`,
        );
      } else {
        const installed =
          layer === "pi"
            ? await installedPiNpmPackage(source, settingsPath)
            : undefined;
        addPath(installed ?? source, layer);
        if (layer === "spirecode") spirecodeSources.add(source);
      }
    } catch (error) {
      diagnostics.push(`Ignored ${source}: ${message(error)}`);
    }
  }
  for (const entry of options.extensionSources) {
    const { source, settingsPath, layer } = entry;
    if (!isLocalPath(source)) {
      addPath(source, layer);
      if (layer === "spirecode") spirecodeSources.add(source);
      continue;
    }
    const resolved = resolveUserPath(path.dirname(settingsPath), source);
    try {
      await stat(resolved);
      addPath(resolved, layer);
      if (layer === "spirecode") {
        spirecodeSources.add(source);
        spirecodeSources.add(resolved);
      }
    } catch (error) {
      diagnostics.push(`Ignored ${source}: ${message(error)}`);
    }
  }
  return {
    paths: [...piPaths, ...bundledPaths, ...spirecodePaths],
    diagnostics,
    spirecodeSources,
  };
}

async function verifyBundle(bundleRoot: string): Promise<void> {
  const manifest = JSON.parse(
    await readFile(path.join(bundleRoot, "bundle-manifest.json"), "utf8"),
  ) as { packages?: Array<{ name?: string }>; files?: Record<string, string> };
  const names = (manifest.packages ?? []).map((entry) => entry.name).sort();
  const expected = [...BUNDLED_PACKAGE_NAMES].sort();
  if (JSON.stringify(names) !== JSON.stringify(expected)) {
    throw new Error("Bundled Pi package manifest is incomplete");
  }
  for (const [relativePath, expectedHash] of Object.entries(
    manifest.files ?? {},
  )) {
    const file = path.join(bundleRoot, relativePath);
    const info = await lstat(file);
    if (!info.isFile() || info.isSymbolicLink()) {
      throw new Error(
        `Bundled Pi resource is not a regular file: ${relativePath}`,
      );
    }
    const hash = createHash("sha256")
      .update(await readFile(file))
      .digest("hex");
    if (hash !== expectedHash) {
      throw new Error(
        `Bundled Pi resource failed integrity check: ${relativePath}`,
      );
    }
  }
}

async function verifyPackage(
  packageRoot: string,
  expectedName: string,
): Promise<void> {
  const manifest = JSON.parse(
    await readFile(path.join(packageRoot, "package.json"), "utf8"),
  );
  if (manifest.name !== expectedName) {
    throw new Error(
      `Bundled Pi package ${expectedName} has an invalid manifest`,
    );
  }
}

async function findPackageRoot(source: string): Promise<string> {
  const info = await stat(source);
  let current = info.isDirectory() ? source : path.dirname(source);
  while (true) {
    try {
      await stat(path.join(current, "package.json"));
      return current;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
    const parent = path.dirname(current);
    if (parent === current) throw new Error("no package.json found");
    current = parent;
  }
}

function resolveUserPath(settingsDirectory: string, source: string): string {
  if (source === "~") return homedir();
  if (source.startsWith("~/")) return path.join(homedir(), source.slice(2));
  return path.resolve(settingsDirectory, source);
}

export function applyExtensionPrecedence(
  result: LoadExtensionsResult,
  spirecodeSources: ReadonlySet<string>,
): LoadExtensionsResult {
  const sourcesByPath = new Map(
    result.extensions.map((extension) => [
      extension.resolvedPath,
      extension.sourceInfo.source,
    ]),
  );
  const isSpirecode = (extensionPath: string) =>
    spirecodeSources.has(sourcesByPath.get(extensionPath) ?? extensionPath);
  const spirecodeProviderNames = new Set([
    ...result.runtime.pendingProviderRegistrations
      .filter((entry) => isSpirecode(entry.extensionPath))
      .map((entry) => entry.name),
    ...result.runtime.pendingNativeProviderRegistrations
      .filter((entry) => isSpirecode(entry.extensionPath))
      .map((entry) => entry.provider.id),
  ]);
  result.runtime.pendingProviderRegistrations = preferSpirecodeProviders(
    result.runtime.pendingProviderRegistrations,
    (entry) => entry.name,
    (entry) => isSpirecode(entry.extensionPath),
    spirecodeProviderNames,
  );
  result.runtime.pendingNativeProviderRegistrations = preferSpirecodeProviders(
    result.runtime.pendingNativeProviderRegistrations,
    (entry) => entry.provider.id,
    (entry) => isSpirecode(entry.extensionPath),
    spirecodeProviderNames,
  );
  return result;
}

export function assertNoExtensionConflicts(
  result: LoadExtensionsResult,
): LoadExtensionsResult {
  if (result.errors.length > 0) {
    throw new Error(
      `Unable to load SpireCode extensions: ${result.errors
        .map((error) => `${error.path}: ${error.error}`)
        .join("; ")}`,
    );
  }
  assertUniqueRegistrations(result.extensions, "tools");
  assertUniqueRegistrations(result.extensions, "commands");
  const providers = [
    ...result.runtime.pendingProviderRegistrations.map((entry) => ({
      name: entry.name,
      path: entry.extensionPath,
    })),
    ...result.runtime.pendingNativeProviderRegistrations.map((entry) => ({
      name: entry.provider.id,
      path: entry.extensionPath,
    })),
  ];
  assertUniqueOwners("Provider", providers);
  return result;
}

function preferSpirecodeProviders<T>(
  registrations: T[],
  nameOf: (entry: T) => string,
  isSpirecode: (entry: T) => boolean,
  spirecodeNames: ReadonlySet<string>,
): T[] {
  return registrations.filter(
    (entry) => isSpirecode(entry) || !spirecodeNames.has(nameOf(entry)),
  );
}

function assertUniqueRegistrations(
  extensions: Extension[],
  kind: "tools" | "commands",
): void {
  const registrations = extensions.flatMap((extension) =>
    [...extension[kind].keys()].map((name) => ({
      name,
      path: extension.resolvedPath,
    })),
  );
  assertUniqueOwners(kind === "tools" ? "Tool" : "Command", registrations);
}

function assertUniqueOwners(
  label: string,
  registrations: Array<{ name: string; path: string }>,
): void {
  const owners = new Map<string, string>();
  for (const registration of registrations) {
    const owner = owners.get(registration.name);
    if (owner) {
      throw new Error(
        `${label} ${registration.name} is registered by ${owner} and ${registration.path}`,
      );
    }
    owners.set(registration.name, registration.path);
  }
}

async function installedPiNpmPackage(
  source: string,
  settingsPath: string,
): Promise<string | undefined> {
  const packageName = npmPackageName(source);
  if (!packageName) return undefined;
  const installed = path.join(
    path.dirname(settingsPath),
    "npm",
    "node_modules",
    packageName,
  );
  try {
    const manifest = JSON.parse(
      await readFile(path.join(installed, "package.json"), "utf8"),
    );
    return manifest.name === packageName ? installed : undefined;
  } catch {
    return undefined;
  }
}

function npmPackageName(source: string): string | undefined {
  return /^npm:((?:@[^/]+\/)?[^@]+)(?:@.*)?$/.exec(source)?.[1];
}

function bundledNpmPackage(source: string): string | undefined {
  const packageName = npmPackageName(source);
  return packageName &&
    BUNDLED_PACKAGE_NAMES.some((name) => name === packageName)
    ? packageName
    : undefined;
}

function isLocalPath(source: string): boolean {
  return (
    source.startsWith(".") || source.startsWith("/") || source.startsWith("~")
  );
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
