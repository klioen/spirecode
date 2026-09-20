import { mkdtemp, mkdir, readFile, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  APPLICATION_ID,
  LEGACY_APPLICATION_ID,
  MIGRATION_MARKER,
  migrateApplicationUserData,
  resolveUserDataDirectory,
  userDataOverrideFromArgv,
} from "./applicationIdentity.js";

const roots: string[] = [];

async function temporaryRoot(): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), "spirecode-identity-"));
  roots.push(root);
  return root;
}

async function createProfile(directory: string, project = "legacy") {
  await mkdir(path.join(directory, "logs"), { recursive: true });
  await writeFile(
    path.join(directory, "state.json"),
    JSON.stringify({ projects: [{ name: project }] }),
  );
  await writeFile(
    path.join(directory, "extension-settings.json"),
    JSON.stringify({ extensions: {} }),
  );
  await writeFile(path.join(directory, "logs", "spirecode.log"), "kept\n");
  await writeFile(path.join(directory, "browser-data"), "also kept\n");
}

afterEach(async () => {
  const { rm } = await import("node:fs/promises");
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true })),
  );
});

describe("application identity", () => {
  it("uses the explicit user-data-dir without migrating", async () => {
    const root = await temporaryRoot();
    const override = path.join(root, "isolated");
    const legacy = path.join(root, LEGACY_APPLICATION_ID);
    await createProfile(legacy);

    expect(
      userDataOverrideFromArgv(["electron", `--user-data-dir=${override}`]),
    ).toBe(override);
    expect(
      userDataOverrideFromArgv(["electron", "--user-data-dir", override]),
    ).toBe(override);
    await expect(
      resolveUserDataDirectory(root, [
        "electron",
        `--user-data-dir=${override}`,
      ]),
    ).resolves.toEqual({ path: override, status: "override" });
    await expect(
      readFile(path.join(legacy, "state.json"), "utf8"),
    ).resolves.toContain("legacy");
  });

  it("selects the production directory when no legacy profile exists", async () => {
    const root = await temporaryRoot();

    await expect(migrateApplicationUserData(root)).resolves.toEqual({
      path: path.join(root, APPLICATION_ID),
      status: "new",
    });
  });

  it("copies an old-only profile, validates it, and writes a marker", async () => {
    const root = await temporaryRoot();
    const legacy = path.join(root, LEGACY_APPLICATION_ID);
    const current = path.join(root, APPLICATION_ID);
    await createProfile(legacy);

    await expect(migrateApplicationUserData(root)).resolves.toEqual({
      path: current,
      status: "migrated",
    });
    await expect(
      readFile(path.join(current, "state.json"), "utf8"),
    ).resolves.toContain("legacy");
    await expect(
      readFile(path.join(current, "browser-data"), "utf8"),
    ).resolves.toBe("also kept\n");
    await expect(
      readFile(path.join(current, MIGRATION_MARKER), "utf8"),
    ).resolves.toContain(LEGACY_APPLICATION_ID);
  });

  it("replaces an empty production directory with the legacy profile", async () => {
    const root = await temporaryRoot();
    const legacy = path.join(root, LEGACY_APPLICATION_ID);
    const current = path.join(root, APPLICATION_ID);
    await createProfile(legacy, "legacy");
    await mkdir(current, { recursive: true });

    await expect(migrateApplicationUserData(root)).resolves.toEqual({
      path: current,
      status: "migrated",
    });
    await expect(
      readFile(path.join(current, "state.json"), "utf8"),
    ).resolves.toContain("legacy");
  });

  it("never overwrites an existing production profile and is idempotent", async () => {
    const root = await temporaryRoot();
    const legacy = path.join(root, LEGACY_APPLICATION_ID);
    const current = path.join(root, APPLICATION_ID);
    await createProfile(legacy, "legacy");
    await createProfile(current, "current");

    await expect(migrateApplicationUserData(root)).resolves.toEqual({
      path: current,
      status: "existing",
    });
    await expect(migrateApplicationUserData(root)).resolves.toEqual({
      path: current,
      status: "existing",
    });
    await expect(
      readFile(path.join(current, "state.json"), "utf8"),
    ).resolves.toContain("current");
  });

  it.each([
    [
      "temporary directory",
      {
        createTemporaryDirectory: async () => {
          throw new Error("simulated temporary directory failure");
        },
      },
    ],
    [
      "copy",
      {
        copyDirectory: async () => {
          throw new Error("simulated copy failure");
        },
      },
    ],
  ])(
    "falls back to the untouched legacy profile after a %s failure",
    async (_label, operations) => {
      const root = await temporaryRoot();
      const legacy = path.join(root, LEGACY_APPLICATION_ID);
      await createProfile(legacy);

      const result = await migrateApplicationUserData(root, operations);

      expect(result).toEqual({
        path: legacy,
        status: "fallback",
        reason: "copy-failed",
      });
      await expect(
        readFile(path.join(legacy, "state.json"), "utf8"),
      ).resolves.toContain("legacy");
    },
  );

  it.runIf(process.platform !== "win32")(
    "falls back without following symlinks in legacy data",
    async () => {
      const root = await temporaryRoot();
      const legacy = path.join(root, LEGACY_APPLICATION_ID);
      const outside = path.join(root, "outside.txt");
      await createProfile(legacy);
      await writeFile(outside, "private");
      await symlink(outside, path.join(legacy, "linked.txt"));

      await expect(migrateApplicationUserData(root)).resolves.toEqual({
        path: legacy,
        status: "fallback",
        reason: "copy-failed",
      });
    },
  );

  it("falls back without copying malformed durable state", async () => {
    const root = await temporaryRoot();
    const legacy = path.join(root, LEGACY_APPLICATION_ID);
    await mkdir(legacy, { recursive: true });
    await writeFile(path.join(legacy, "state.json"), "{not-json");

    await expect(migrateApplicationUserData(root)).resolves.toEqual({
      path: legacy,
      status: "fallback",
      reason: "invalid-legacy-data",
    });
  });

  it("recovers safely when another process wins the atomic rename", async () => {
    const root = await temporaryRoot();
    const legacy = path.join(root, LEGACY_APPLICATION_ID);
    const current = path.join(root, APPLICATION_ID);
    await createProfile(legacy, "legacy");

    const result = await migrateApplicationUserData(root, {
      beforeRename: async () => createProfile(current, "concurrent"),
    });

    expect(result).toEqual({ path: current, status: "existing" });
    await expect(
      readFile(path.join(current, "state.json"), "utf8"),
    ).resolves.toContain("concurrent");
  });
});
