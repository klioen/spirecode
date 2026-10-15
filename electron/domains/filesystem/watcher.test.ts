// @vitest-environment node
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  WatcherRegistry,
  watcherBackendForPlatform,
  type WatchEvent,
} from "./watcher.js";

const temporaryDirectories: string[] = [];

async function temporaryDirectory(): Promise<string> {
  const directory = await mkdtemp(path.join(os.tmpdir(), "spire-watcher-"));
  temporaryDirectories.push(directory);
  return directory;
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe("WatcherRegistry", () => {
  it("uses one native recursive watcher on Darwin and keeps the portable fallback", () => {
    expect(watcherBackendForPlatform("darwin")).toBe("native-recursive");
    expect(watcherBackendForPlatform("linux")).toBe("chokidar");
    expect(watcherBackendForPlatform("win32")).toBe("chokidar");
  });

  it.each([
    ["omitted", undefined],
    ["null", null],
  ] as const)(
    "emits only filesystem changes when Git metadata is %s",
    async (_label, gitDirectory) => {
      const root = await temporaryDirectory();
      const events: WatchEvent[] = [];
      const registry = new WatcherRegistry();
      const sink = (event: WatchEvent) => events.push(event);

      if (gitDirectory === undefined) {
        await registry.ensure("directory-1", root, sink);
      } else {
        await registry.ensure("directory-1", root, gitDirectory, sink);
      }
      await writeFile(path.join(root, "file.ts"), "export {};\n");
      await vi.waitFor(
        () => {
          expect(
            events.some(
              (event) =>
                event.topic === "filesystem://changed" &&
                event.payload.paths.includes("file.ts"),
            ),
          ).toBe(true);
        },
        { timeout: 5_000 },
      );
      await new Promise((resolve) => setTimeout(resolve, 250));

      expect(events.some((event) => event.topic === "git://changed")).toBe(
        false,
      );
      await registry.dispose();
    },
  );

  it("preserves filesystem and Git invalidations for Git watchers", async () => {
    const root = await temporaryDirectory();
    const gitDirectory = path.join(root, ".git");
    await mkdir(gitDirectory);
    const events: WatchEvent[] = [];
    const registry = new WatcherRegistry();

    await registry.ensure("git-1", root, gitDirectory, (event) =>
      events.push(event),
    );
    await writeFile(path.join(root, "file.ts"), "export {};\n");
    await vi.waitFor(
      () => {
        expect(
          events.some((event) => event.topic === "filesystem://changed"),
        ).toBe(true);
        expect(events.some((event) => event.topic === "git://changed")).toBe(
          true,
        );
      },
      { timeout: 5_000 },
    );

    await registry.dispose();
  });

  it.runIf(process.platform === "darwin")(
    "observes nested files with the native recursive backend and releases it",
    async () => {
      const root = await temporaryDirectory();
      const gitDirectory = path.join(root, ".git");
      const nested = path.join(root, "src", "nested");
      await mkdir(gitDirectory);
      await mkdir(nested, { recursive: true });
      const events: WatchEvent[] = [];
      const registry = new WatcherRegistry();

      await registry.ensure("worktree-1", root, gitDirectory, (event) =>
        events.push(event),
      );
      await writeFile(path.join(nested, "file.ts"), "export {};\n");
      await vi.waitFor(
        () => {
          expect(
            events.some(
              (event) =>
                event.topic === "filesystem://changed" &&
                event.payload.paths.includes(
                  path.join("src", "nested", "file.ts"),
                ),
            ),
          ).toBe(true);
        },
        { timeout: 5_000 },
      );

      await registry.close("worktree-1");
      const countAfterClose = events.length;
      await writeFile(path.join(nested, "after-close.ts"), "export {};\n");
      await new Promise((resolve) => setTimeout(resolve, 250));
      expect(events).toHaveLength(countAfterClose);
    },
  );
});
