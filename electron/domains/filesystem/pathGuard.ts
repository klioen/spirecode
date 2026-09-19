import { lstat, realpath } from "node:fs/promises";
import path from "node:path";
import { CommandError, toCommandError } from "../../core/errors.js";

export interface ResolvedPath {
  root: string;
  path: string;
}

function isWithin(root: string, candidate: string): boolean {
  const relative = path.relative(root, candidate);
  return (
    relative === "" ||
    (!relative.startsWith(`..${path.sep}`) &&
      relative !== ".." &&
      !path.isAbsolute(relative))
  );
}

function validateRelativePath(relativePath: string): void {
  if (
    path.isAbsolute(relativePath) ||
    path.posix.isAbsolute(relativePath) ||
    path.win32.isAbsolute(relativePath)
  ) {
    throw new CommandError(
      "OUTSIDE_PROJECT",
      "path must contain only normal relative components",
    );
  }

  const components = relativePath.split(/[\\/]/);
  if (components.some((component) => component === "." || component === "..")) {
    throw new CommandError(
      "OUTSIDE_PROJECT",
      "path must contain only normal relative components",
    );
  }
  if (components.includes(".git")) {
    throw new CommandError("OUTSIDE_PROJECT", ".git is not accessible");
  }
}

async function realpathWithMissingTail(target: string): Promise<string> {
  let existing = target;
  const missing: string[] = [];

  for (;;) {
    try {
      await lstat(existing);
      break;
    } catch (error) {
      const value = error as NodeJS.ErrnoException;
      if (value.code !== "ENOENT") throw error;
      const parent = path.dirname(existing);
      if (parent === existing) {
        throw new CommandError(
          "OUTSIDE_PROJECT",
          "path has no existing ancestor",
        );
      }
      missing.push(path.basename(existing));
      existing = parent;
    }
  }

  return path.join(await realpath(existing), ...missing.reverse());
}

export async function resolveProjectPath(
  projectRoot: string,
  relativePath: string,
  mustExist = true,
): Promise<ResolvedPath> {
  validateRelativePath(relativePath);

  try {
    const root = await realpath(projectRoot);
    if (relativePath === "") return { root, path: root };

    const target = path.join(root, relativePath);
    const resolved = mustExist
      ? await realpath(target)
      : await realpathWithMissingTail(target);
    if (!isWithin(root, resolved)) {
      throw new CommandError(
        "OUTSIDE_PROJECT",
        "resolved path is outside project",
      );
    }
    return { root, path: resolved };
  } catch (error) {
    throw toCommandError(error);
  }
}
