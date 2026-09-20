import {
  cp,
  lstat,
  mkdtemp,
  mkdir,
  readFile,
  readdir,
  rename,
  rm,
  rmdir,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";

export const APPLICATION_ID = "io.github.klioen.spirecode";
export const LEGACY_APPLICATION_ID = "com.bytedance.spirecode.dev";
export const MIGRATION_MARKER = ".spirecode-user-data-migration.json";

const DURABLE_JSON_FILES = ["state.json", "extension-settings.json"] as const;

export type UserDataResolution =
  | { path: string; status: "override" | "new" | "existing" | "migrated" }
  | {
      path: string;
      status: "fallback";
      reason: "invalid-legacy-data" | "copy-failed";
      detail?: string;
    };

interface MigrationOperations {
  createTemporaryDirectory?: (prefix: string) => Promise<string>;
  copyDirectory?: (source: string, destination: string) => Promise<void>;
  beforeRename?: () => Promise<void>;
}

interface ManifestEntry {
  path: string;
  type: "directory" | "file";
  value?: string;
}

export function userDataOverrideFromArgv(
  argv: readonly string[],
): string | undefined {
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument.startsWith("--user-data-dir=")) {
      return argument.slice("--user-data-dir=".length) || undefined;
    }
    if (argument === "--user-data-dir") return argv[index + 1] || undefined;
  }
  return undefined;
}

export async function resolveUserDataDirectory(
  appDataDirectory: string,
  argv: readonly string[],
  operations: MigrationOperations = {},
): Promise<UserDataResolution> {
  const override = userDataOverrideFromArgv(argv);
  if (override) return { path: override, status: "override" };
  return migrateApplicationUserData(appDataDirectory, operations);
}

export async function migrateApplicationUserData(
  appDataDirectory: string,
  operations: MigrationOperations = {},
): Promise<UserDataResolution> {
  const legacyDirectory = path.join(appDataDirectory, LEGACY_APPLICATION_ID);
  const currentDirectory = path.join(appDataDirectory, APPLICATION_ID);

  if (await directoryHasEntries(currentDirectory))
    return { path: currentDirectory, status: "existing" };
  if (await exists(currentDirectory)) {
    try {
      await rmdir(currentDirectory);
    } catch {
      return { path: currentDirectory, status: "existing" };
    }
  }
  if (!(await exists(legacyDirectory)))
    return { path: currentDirectory, status: "new" };

  try {
    await validateDurableLayout(legacyDirectory);
  } catch {
    return {
      path: legacyDirectory,
      status: "fallback",
      reason: "invalid-legacy-data",
    };
  }

  let temporaryDirectory: string | undefined;
  try {
    await mkdir(appDataDirectory, { recursive: true });
    const createTemporaryDirectory =
      operations.createTemporaryDirectory ?? mkdtemp;
    temporaryDirectory = await createTemporaryDirectory(
      path.join(appDataDirectory, `.${APPLICATION_ID}.migration-`),
    );
    const copyDirectory =
      operations.copyDirectory ??
      ((source, destination) =>
        cp(source, destination, {
          recursive: true,
          force: false,
          preserveTimestamps: true,
        }));
    await copyDirectory(legacyDirectory, temporaryDirectory);
    await validateDurableLayout(temporaryDirectory);
    await verifyCopy(legacyDirectory, temporaryDirectory);
    await writeFile(
      path.join(temporaryDirectory, MIGRATION_MARKER),
      `${JSON.stringify({
        version: 1,
        from: LEGACY_APPLICATION_ID,
        to: APPLICATION_ID,
      })}\n`,
      { flag: "wx" },
    );
    await operations.beforeRename?.();

    if (await exists(currentDirectory)) {
      await rm(temporaryDirectory, { recursive: true, force: true });
      return { path: currentDirectory, status: "existing" };
    }
    try {
      await rename(temporaryDirectory, currentDirectory);
      return { path: currentDirectory, status: "migrated" };
    } catch (error) {
      if (await exists(currentDirectory)) {
        await rm(temporaryDirectory, { recursive: true, force: true });
        return { path: currentDirectory, status: "existing" };
      }
      throw error;
    }
  } catch (error) {
    if (temporaryDirectory)
      await rm(temporaryDirectory, { recursive: true, force: true }).catch(
        () => undefined,
      );
    const detail = error instanceof Error ? error.message : String(error);
    console.error("[migration] copy-failed:", detail);
    return {
      path: legacyDirectory,
      status: "fallback",
      reason: "copy-failed",
      detail: detail.slice(0, 200),
    };
  }
}

async function validateDurableLayout(directory: string): Promise<void> {
  for (const filename of DURABLE_JSON_FILES) {
    const candidate = path.join(directory, filename);
    if (!(await exists(candidate))) continue;
    const metadata = await lstat(candidate);
    if (!metadata.isFile()) throw new Error(`${filename} is not a file`);
    JSON.parse(await readFile(candidate, "utf8"));
  }

  const logsDirectory = path.join(directory, "logs");
  if (
    (await exists(logsDirectory)) &&
    !(await lstat(logsDirectory)).isDirectory()
  )
    throw new Error("logs is not a directory");
}

async function verifyCopy(source: string, destination: string): Promise<void> {
  const [sourceManifest, destinationManifest] = await Promise.all([
    createManifest(source),
    createManifest(destination),
  ]);
  if (JSON.stringify(sourceManifest) !== JSON.stringify(destinationManifest))
    throw new Error("user data copy verification failed");
}

async function createManifest(
  root: string,
  relativeDirectory = "",
): Promise<ManifestEntry[]> {
  const entries: ManifestEntry[] = [];
  const directory = path.join(root, relativeDirectory);
  for (const item of await readdir(directory, { withFileTypes: true })) {
    const relativePath = path.join(relativeDirectory, item.name);
    const absolutePath = path.join(root, relativePath);
    if (item.isDirectory()) {
      entries.push({ path: relativePath, type: "directory" });
      entries.push(...(await createManifest(root, relativePath)));
    } else if (item.isFile()) {
      const digest = createHash("sha256")
        .update(await readFile(absolutePath))
        .digest("hex");
      entries.push({ path: relativePath, type: "file", value: digest });
    } else if (item.isSymbolicLink()) {
      throw new Error(`refusing symbolic link in user data: ${relativePath}`);
    } else {
      throw new Error(`unsupported user data entry: ${relativePath}`);
    }
  }
  return entries.sort((left, right) => left.path.localeCompare(right.path));
}

async function directoryHasEntries(candidate: string): Promise<boolean> {
  try {
    const metadata = await lstat(candidate);
    if (!metadata.isDirectory()) return true;
    return (await readdir(candidate)).length > 0;
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") return false;
    throw error;
  }
}

async function exists(candidate: string): Promise<boolean> {
  try {
    await lstat(candidate);
    return true;
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") return false;
    throw error;
  }
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}
