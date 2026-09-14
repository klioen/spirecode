import { constants } from "node:fs";
import { access, mkdir, open, readFile, rename, rm } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { CommandError, toCommandError } from "../../core/errors.js";

export function corruptBackupPath(filePath: string): string {
  const parsed = path.parse(filePath);
  return path.join(parsed.dir, `${parsed.name}.corrupt.json`);
}

export async function loadOrDefault<T>(
  filePath: string,
  createDefault: () => T,
): Promise<T> {
  let bytes: Buffer;
  try {
    bytes = await readFile(filePath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT")
      return createDefault();
    throw toCommandError(error);
  }

  try {
    return JSON.parse(bytes.toString("utf8")) as T;
  } catch (error) {
    const backup = corruptBackupPath(filePath);
    try {
      await rename(filePath, backup);
    } catch (renameError) {
      throw toCommandError(renameError);
    }
    console.warn(
      `warning: durable state was corrupt (${error instanceof Error ? error.message : String(error)}); backed up to ${backup} and reset`,
    );
    return createDefault();
  }
}

export async function saveAtomic(
  filePath: string,
  value: unknown,
): Promise<void> {
  const parent = path.dirname(filePath);
  if (parent === filePath) {
    throw new CommandError("INVALID_ARGUMENT", "state path has no parent");
  }

  await mkdir(parent, { recursive: true }).catch((error: unknown) => {
    throw toCommandError(error);
  });
  const temp = path.join(
    parent,
    `.${path.basename(filePath)}.${randomUUID()}.tmp`,
  );
  let handle: Awaited<ReturnType<typeof open>> | undefined;

  try {
    let json: string;
    try {
      json = `${JSON.stringify(value, null, 2)}\n`;
    } catch (error) {
      throw new CommandError(
        "INVALID_ARGUMENT",
        error instanceof Error ? error.message : String(error),
      );
    }
    if (json === "undefined\n") {
      throw new CommandError(
        "INVALID_ARGUMENT",
        "value is not JSON serializable",
      );
    }

    handle = await open(temp, "wx");
    await handle.writeFile(json, "utf8");
    await handle.sync();
    await handle.close();
    handle = undefined;
    await rename(temp, filePath);

    // Directory fsync makes the rename durable on platforms that support it.
    const directory = await open(parent, constants.O_RDONLY);
    try {
      await directory.sync();
    } finally {
      await directory.close();
    }
  } catch (error) {
    if (handle) await handle.close().catch(() => undefined);
    await rm(temp, { force: true }).catch(() => undefined);
    throw error instanceof CommandError ? error : toCommandError(error);
  }
}

export async function exists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw toCommandError(error);
  }
}
