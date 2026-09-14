import { realpath } from "node:fs/promises";
import { relative, sep } from "node:path";
import chokidar, { type FSWatcher } from "chokidar";
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
  watcher: FSWatcher;
  stop: () => Promise<void>;
}

export class WatcherRegistry {
  private readonly sessions = new Map<string, WatchSession>();

  async ensure(
    worktreeId: string,
    rootPath: string,
    gitDirectory: string,
    sink: (event: WatchEvent) => void,
  ): Promise<void> {
    if (this.sessions.has(worktreeId)) return;
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

    let watcher: FSWatcher | undefined;
    try {
      const created = chokidar.watch(watchPaths, {
        ignoreInitial: true,
        persistent: true,
      });
      watcher = created;
      created.on("all", (_event, path) => collect(path));
      created.on("error", () => {
        truncated = true;
        gitChanged = true;
        schedule();
      });
      await new Promise<void>((resolve, reject) => {
        created.once("ready", resolve);
        created.once("error", reject);
      });
    } catch (error) {
      closed = true;
      if (timer) clearTimeout(timer);
      await watcher?.close();
      throw new CommandError(
        "INVALID_ARGUMENT",
        `filesystem watcher failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
    const activeWatcher = watcher;
    if (!activeWatcher)
      throw new CommandError(
        "INVALID_ARGUMENT",
        "filesystem watcher failed to initialize",
      );
    if (this.sessions.has(worktreeId)) {
      await activeWatcher.close();
      return;
    }
    this.sessions.set(worktreeId, {
      watcher: activeWatcher,
      stop: async () => {
        closed = true;
        if (timer) clearTimeout(timer);
        await activeWatcher.close();
      },
    });
  }

  async close(worktreeId: string): Promise<void> {
    const session = this.sessions.get(worktreeId);
    if (!session) return;
    this.sessions.delete(worktreeId);
    await session.stop();
  }

  async dispose(): Promise<void> {
    await Promise.all([...this.sessions].map(([id]) => this.close(id)));
  }
}

function isWithin(root: string, candidate: string): boolean {
  const value = relative(root, candidate);
  return value === "" || (value !== ".." && !value.startsWith(`..${sep}`));
}
