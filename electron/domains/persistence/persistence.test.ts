import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { corruptBackupPath, loadOrDefault, saveAtomic } from "./index.js";

const cleanup: string[] = [];

async function tempDir(): Promise<string> {
  const directory = await mkdtemp(
    path.join(os.tmpdir(), "spirecode-persistence-"),
  );
  cleanup.push(directory);
  return directory;
}

afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(
    cleanup.splice(0).map((directory) => rm(directory, { recursive: true })),
  );
});

describe("persistence", () => {
  it("atomically round-trips pretty JSON with a trailing newline", async () => {
    const directory = await tempDir();
    const statePath = path.join(directory, "nested", "state.json");

    await saveAtomic(statePath, { value: 7 });

    expect(await loadOrDefault(statePath, () => ({ value: 0 }))).toEqual({
      value: 7,
    });
    expect(await readFile(statePath, "utf8")).toBe('{\n  "value": 7\n}\n');
    expect(
      (await readdir(path.dirname(statePath))).filter((name) =>
        name.endsWith(".tmp"),
      ),
    ).toEqual([]);
  });

  it("returns a fresh default for a missing file", async () => {
    const directory = await tempDir();
    const statePath = path.join(directory, "missing.json");

    expect(await loadOrDefault(statePath, () => ({ projects: [] }))).toEqual({
      projects: [],
    });
  });

  it("backs up corrupt JSON and resets", async () => {
    const directory = await tempDir();
    const statePath = path.join(directory, "state.json");
    await writeFile(statePath, "bad json");
    vi.spyOn(console, "warn").mockImplementation(() => undefined);

    expect(await loadOrDefault(statePath, () => ({ value: 0 }))).toEqual({
      value: 0,
    });
    expect(await readFile(corruptBackupPath(statePath), "utf8")).toBe(
      "bad json",
    );
  });

  it("rejects values that JSON cannot serialize without leaving a temp file", async () => {
    const directory = await tempDir();
    const statePath = path.join(directory, "state.json");

    await expect(saveAtomic(statePath, { value: 1n })).rejects.toMatchObject({
      code: "INVALID_ARGUMENT",
    });
    expect(
      (await readdir(directory)).filter((name) => name.endsWith(".tmp")),
    ).toEqual([]);
  });
});
