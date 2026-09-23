import { watch, type FSWatcher as NativeFSWatcher } from "node:fs";
import { realpath } from "node:fs/promises";
import { join, relative, sep } from "node:path";
import chokidar from "chokidar";
import { CommandError } from "../../core/errors.js";

const BATCH_MS = 120;
const MAX_PATHS = 256;

export interface FilesystemChangedPayload {
  worktreeId: string;
  paths: string[];
  truncated: boolean;
}

export type WatchEvent =
  | { topic: "filesystem://changed"; payload: FilesystemChangedPayload }
  | { topic: "git://changed"; payload: { worktreeId: string } };

interface WatchSession {
  stop: () => Promise<void>;
}

export type WatcherBackend = "native-recursive" | "chokidar";

export function watcherBackendForPlatform(
  platform: NodeJS.Platform,
): WatcherBackend {
  return platform === "darwin" ? "native-recursive" : "chokidar";
}

export class WatcherRegistry {
  private readonly sessions = new Map<string, WatchSession>();
  private readonly generations = new Map<string, number>();
  private disposed = false;

  async ensure(
    worktreeId: string,
    rootPath: string,
    gitDirectory: string,
    sink: (event: WatchEvent) => void,
  ): Promise<void> {
    if (this.disposed || this.sessions.has(worktreeId)) return;
    const generation = this.generations.get(worktreeId) ?? 0;
    const root = await realpath(rootPath);
    let gitDir = gitDirectory;
    try {
      gitDir = await realpath(gitDirectory);
    } catch {
      // Missing external git metadata is not fatal during watcher setup.
    }
    const watchPaths = [root];
    if (!isWithin(root, gitDir) && gitDir !== root) watchPaths.push(gitDir);

    let timer: NodeJS.Timeout | undefined;
    const paths = new Set<string>();
    let truncated = false;
    let gitChanged = false;
    let closed = false;

    const flush = () => {
      timer = undefined;
      if (closed) return;
      if (paths.size > 0 || truncated) {
        sink({
          topic: "filesystem://changed",
          payload: {
            worktreeId,
            paths: [...paths].sort(),
            truncated,
          },
        });
      }
      if (gitChanged) sink({ topic: "git://changed", payload: { worktreeId } });
      paths.clear();
      truncated = false;
      gitChanged = false;
    };
    const schedule = () => {
      if (!timer) timer = setTimeout(flush, BATCH_MS);
    };
    const collect = (path: string) => {
      const rel = relative(root, path);
      if (rel === "" || (!rel.startsWith(`..${sep}`) && rel !== "..")) {
        const components = rel.split(sep);
        if (components[0] === ".git") {
          if (
            ["index", "HEAD", "packed-refs", "refs"].includes(
              components[1] ?? "",
            )
          )
            gitChanged = true;
          schedule();
          return;
        }
        if (paths.size >= MAX_PATHS) truncated = true;
        else paths.add(rel);
        gitChanged = true;
      } else {
        gitChanged = true;
      }
      schedule();
    };

    let stopWatcher: (() => Promise<void>) | undefined;
    const handleError = () => {
      truncated = true;
      gitChanged = true;
      schedule();
    };
    try {
      stopWatcher =
        watcherBackendForPlatform(process.platform) === "native-recursive"
          ? createNativeRecursiveWatcher(watchPaths, collect, handleError)
          : await createChokidarWatcher(watchPaths, collect, handleError);
    } catch (error) {
      closed = true;
      if (timer) clearTimeout(timer);
      await stopWatcher?.();
      throw new CommandError(
        "INVALID_ARGUMENT",
        `filesystem watcher failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
    if (
      this.disposed ||
      this.sessions.has(worktreeId) ||
      (this.generations.get(worktreeId) ?? 0) !== generation
    ) {
      await stopWatcher();
      return;
    }
    this.sessions.set(worktreeId, {
      stop: async () => {
        closed = true;
        if (timer) clearTimeout(timer);
        await stopWatcher();
      },
    });
  }

  async close(worktreeId: string): Promise<void> {
    this.generations.set(
      worktreeId,
      (this.generations.get(worktreeId) ?? 0) + 1,
    );
    const session = this.sessions.get(worktreeId);
    if (!session) return;
    this.sessions.delete(worktreeId);
    await session.stop();
  }

  async dispose(): Promise<void> {
    this.disposed = true;
    await Promise.all([...this.sessions].map(([id]) => this.close(id)));
  }
}

function createNativeRecursiveWatcher(
  paths: readonly string[],
  collect: (path: string) => void,
  handleError: () => void,
): () => Promise<void> {
  const watchers: NativeFSWatcher[] = [];
  try {
    for (const target of paths) {
      const watcher = watch(
        target,
        { persistent: true, recursive: true },
        (_event, filename) => {
          if (filename) collect(join(target, filename.toString()));
          else handleError();
        },
      );
      watcher.on("error", handleError);
      watchers.push(watcher);
    }
  } catch (error) {
    for (const watcher of watchers) watcher.close();
    throw error;
  }
  return async () => {
    for (const watcher of watchers) watcher.close();
  };
}

async function createChokidarWatcher(
  paths: readonly string[],
  collect: (path: string) => void,
  handleError: () => void,
): Promise<() => Promise<void>> {
  const watcher = chokidar.watch([...paths], {
    ignoreInitial: true,
    persistent: true,
  });
  watcher.on("all", (_event, path) => collect(path));
  watcher.on("error", handleError);
  try {
    await new Promise<void>((resolve, reject) => {
      watcher.once("ready", resolve);
      watcher.once("error", reject);
    });
  } catch (error) {
    await watcher.close();
    throw error;
  }
  return () => watcher.close();
}

function isWithin(root: string, candidate: string): boolean {
  const value = relative(root, candidate);
  return value === "" || (value !== ".." && !value.startsWith(`..${sep}`));
}
