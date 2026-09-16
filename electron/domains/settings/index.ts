import { createHash } from "node:crypto";
import { homedir } from "node:os";
import { readFile, readdir, realpath, stat } from "node:fs/promises";
import path from "node:path";
import {
  DefaultPackageManager,
  SettingsManager,
  type ResolvedResource,
} from "@earendil-works/pi-coding-agent";
import { AsyncQueue } from "../../core/asyncQueue.js";
import { CommandError } from "../../core/errors.js";
import { loadOrDefault, saveAtomic } from "../persistence/index.js";

export type ExtensionSource = "spirecode" | "pi" | "package";
export type ExtensionScope = "global" | "project";

export interface ExtensionSetting {
  id: string;
  name: string;
  source: ExtensionSource;
  scope: ExtensionScope;
  displayPath: string;
  enabled: boolean;
  status: "enabled" | "disabled";
}

interface ExtensionState {
  version: 1;
  overrides: Record<string, boolean>;
}

interface Candidate {
  path: string;
  loadRoot?: string;
  packageName?: string;
  source: ExtensionSource;
  scope: ExtensionScope;
  defaultEnabled: boolean;
}

const EXTENSION_PATTERN = /\.(?:[cm]?[jt]s)$/i;

export class SettingsService {
  private readonly queue = new AsyncQueue();
  private constructor(
    private readonly statePath: string,
    private readonly agentDir: string,
    private state: ExtensionState,
  ) {}

  static async load(
    statePath: string,
    agentDir = path.join(homedir(), ".pi", "agent"),
  ): Promise<SettingsService> {
    const loaded = await loadOrDefault<ExtensionState>(statePath, () => ({
      version: 1,
      overrides: {},
    }));
    return new SettingsService(statePath, agentDir, sanitizeState(loaded));
  }

  list(cwd: string): Promise<ExtensionSetting[]> {
    return this.queue.run(async () => this.catalog(cwd));
  }

  setEnabled(
    cwd: string,
    requestedId: string,
    enabled: boolean,
  ): Promise<ExtensionSetting[]> {
    return this.queue.run(async () => {
      const candidates = await this.candidates(cwd, true);
      const extension = candidates.find(
        (candidate) => extensionId(candidate) === requestedId,
      );
      if (!extension)
        throw new CommandError("NOT_FOUND", "extension not found");
      const packageRoot =
        extension.source === "package" ? extension.loadRoot : undefined;
      for (const candidate of candidates) {
        if (
          extensionId(candidate) === requestedId ||
          (packageRoot &&
            candidate.source === "package" &&
            candidate.loadRoot === packageRoot)
        )
          this.state.overrides[extensionId(candidate)] = enabled;
      }
      await saveAtomic(this.statePath, this.state);
      return this.catalog(cwd);
    });
  }

  async enabledPaths(cwd: string, basePaths: string[] = []): Promise<string[]> {
    const candidates = await this.candidates(cwd, true);
    const selections = candidates.map((candidate) => ({
      candidate,
      enabled:
        this.state.overrides[extensionId(candidate)] ??
        candidate.defaultEnabled,
    }));
    const canonicalBasePaths = await Promise.all(
      basePaths.map((value) => canonicalPath(value)),
    );
    const basePackageNames = new Set(
      (
        await Promise.all(
          canonicalBasePaths.map((value) => packageNameAt(value)),
        )
      ).filter((value): value is string => Boolean(value)),
    );
    const retained = canonicalBasePaths.filter((basePath) => {
      const represented = selections.filter(({ candidate }) =>
        isRepresentedBy(candidate, basePath),
      );
      if (represented.length === 0) return true;
      return (
        represented.every(({ candidate }) => candidate.source === "package") &&
        represented.some(({ enabled }) => enabled)
      );
    });
    const additions = selections
      .filter(
        ({ candidate, enabled }) =>
          enabled &&
          !(
            candidate.source === "package" &&
            candidate.packageName &&
            basePackageNames.has(candidate.packageName)
          ),
      )
      .map(({ candidate }) =>
        candidate.source === "package" && candidate.loadRoot
          ? candidate.loadRoot
          : candidate.path,
      );
    return [...new Set([...retained, ...additions])];
  }

  private async catalog(cwd: string): Promise<ExtensionSetting[]> {
    const candidates = await this.candidates(cwd, false);
    return candidates
      .map((candidate) => {
        const id = extensionId(candidate);
        const enabled = this.state.overrides[id] ?? candidate.defaultEnabled;
        return {
          id,
          name: extensionName(candidate.path),
          source: candidate.source,
          scope: candidate.scope,
          displayPath: abbreviateHome(candidate.path),
          enabled,
          status: enabled ? "enabled" : "disabled",
        } satisfies ExtensionSetting;
      })
      .sort((left, right) =>
        `${left.source}:${left.scope}:${left.name}`.localeCompare(
          `${right.source}:${right.scope}:${right.name}`,
        ),
      );
  }

  private async candidates(cwd: string, strict: boolean): Promise<Candidate[]> {
    const candidates: Candidate[] = [];
    const directories: Array<{
      directory: string;
      source: ExtensionSource;
      scope: ExtensionScope;
    }> = [
      {
        directory: path.join(homedir(), ".spirecode", "extensions"),
        source: "spirecode",
        scope: "global",
      },
      {
        directory: path.join(cwd, ".spirecode", "extensions"),
        source: "spirecode",
        scope: "project",
      },
    ];
    for (const entry of directories) {
      for (const extensionPath of await discoverDirectory(entry.directory, cwd))
        candidates.push({
          ...entry,
          path: extensionPath,
          defaultEnabled: true,
        });
    }

    const settingsManager = SettingsManager.create(cwd, this.agentDir);
    const manager = new DefaultPackageManager({
      cwd,
      agentDir: this.agentDir,
      settingsManager,
    });
    try {
      const resolved = await manager.resolve(async () => "skip");
      for (const resource of resolved.extensions) {
        const candidate = await fromPiResource(resource, cwd);
        if (candidate) candidates.push(candidate);
      }
    } catch (error) {
      if (strict) throw error;
      console.warn("Unable to resolve Pi extensions", error);
    }

    const unique = new Map<string, Candidate>();
    for (const candidate of candidates) {
      const normalized = path.resolve(candidate.path);
      const key = `${candidate.source}:${candidate.scope}:${normalized}`;
      if (!unique.has(key))
        unique.set(key, {
          ...candidate,
          path: normalized,
          ...(candidate.loadRoot
            ? { loadRoot: path.resolve(candidate.loadRoot) }
            : {}),
        });
    }
    return [...unique.values()];
  }
}

async function fromPiResource(
  resource: ResolvedResource,
  projectRoot: string,
): Promise<Candidate | undefined> {
  const scope = resource.metadata.scope === "project" ? "project" : "global";
  const canonicalPath = await realpath(resource.path);
  if (
    scope === "project" &&
    !isWithin(await realpath(projectRoot), canonicalPath)
  )
    return undefined;
  return {
    path: canonicalPath,
    ...(resource.metadata.baseDir
      ? { loadRoot: await realpath(resource.metadata.baseDir) }
      : {}),
    ...(resource.metadata.origin === "package" && resource.metadata.baseDir
      ? { packageName: await packageNameAt(resource.metadata.baseDir) }
      : {}),
    source: resource.metadata.origin === "package" ? "package" : "pi",
    scope,
    defaultEnabled: resource.enabled,
  };
}

async function discoverDirectory(
  directory: string,
  projectRoot: string,
): Promise<string[]> {
  const canonicalProjectRoot = await realpath(projectRoot);
  let entries;
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
  const result: string[] = [];
  for (const entry of entries) {
    const candidate = path.join(directory, entry.name);
    let extensionPath: string | undefined;
    if (entry.isFile() && EXTENSION_PATTERN.test(entry.name)) {
      extensionPath = candidate;
    } else if (entry.isDirectory()) {
      for (const name of [
        "index.ts",
        "index.js",
        "index.mts",
        "index.mjs",
        "index.cts",
        "index.cjs",
      ]) {
        const index = path.join(candidate, name);
        try {
          if ((await stat(index)).isFile()) {
            extensionPath = index;
            break;
          }
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
        }
      }
    }
    if (!extensionPath) continue;
    const canonical = await realpath(extensionPath);
    if (
      path.resolve(directory).startsWith(path.resolve(projectRoot) + path.sep)
    ) {
      const relative = path.relative(canonicalProjectRoot, canonical);
      if (relative.startsWith("..") || path.isAbsolute(relative)) continue;
    }
    result.push(canonical);
  }
  return result;
}

async function canonicalPath(value: string): Promise<string> {
  if (/^[a-z][a-z0-9+.-]*:/i.test(value)) return value;
  return realpath(value);
}

async function packageNameAt(value: string): Promise<string | undefined> {
  try {
    const manifest = JSON.parse(
      await readFile(path.join(value, "package.json"), "utf8"),
    ) as { name?: unknown };
    return typeof manifest.name === "string" ? manifest.name : undefined;
  } catch {
    return undefined;
  }
}

function isRepresentedBy(candidate: Candidate, basePath: string): boolean {
  if (candidate.source === "package") return candidate.loadRoot === basePath;
  return candidate.path === basePath || isWithin(basePath, candidate.path);
}

function isWithin(root: string, candidate: string): boolean {
  const relative = path.relative(root, candidate);
  return (
    relative === "" ||
    (!relative.startsWith("..") && !path.isAbsolute(relative))
  );
}

function extensionId(candidate: Candidate): string {
  return createHash("sha256")
    .update(`${candidate.source}\0${candidate.scope}\0${candidate.path}`)
    .digest("hex")
    .slice(0, 24);
}

function extensionName(extensionPath: string): string {
  const parsed = path.parse(extensionPath);
  return parsed.name === "index" ? path.basename(parsed.dir) : parsed.name;
}

function abbreviateHome(value: string): string {
  const home = homedir();
  return value === home || value.startsWith(home + path.sep)
    ? `~${value.slice(home.length)}`
    : value;
}

function sanitizeState(value: ExtensionState): ExtensionState {
  const overrides: Record<string, boolean> = {};
  if (value && typeof value.overrides === "object" && value.overrides) {
    for (const [key, enabled] of Object.entries(value.overrides))
      if (/^[a-f0-9]{24}$/.test(key) && typeof enabled === "boolean")
        overrides[key] = enabled;
  }
  return { version: 1, overrides };
}
