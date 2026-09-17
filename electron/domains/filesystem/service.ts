import {
  chmod,
  lstat,
  readFile as fsReadFile,
  readdir,
  rename,
  rm,
  stat,
  writeFile as fsWriteFile,
} from "node:fs/promises";
import { createHash, randomUUID } from "node:crypto";
import path from "node:path";
import ignore, { type Ignore } from "ignore";
import { CommandError, toCommandError } from "../../core/errors.js";
import { resolveProjectPath } from "./pathGuard.js";

export const MAX_TEXT_BYTES = 5 * 1024 * 1024;

export type EntryKind = "directory" | "file" | "symlink";

export interface FileEntry {
  name: string;
  relativePath: string;
  kind: EntryKind;
  size?: number;
}

export interface FileContent {
  relativePath: string;
  content: string;
  size: number;
  version: string;
}

export type RootResolver = (worktreeId: string) => string | Promise<string>;

const naturalCollator = new Intl.Collator("en", {
  numeric: true,
  sensitivity: "base",
});

const fileVersion = (bytes: Uint8Array): string =>
  createHash("sha256").update(bytes).digest("hex");

function decodeTextFile(bytes: Buffer): string {
  if (bytes.includes(0)) {
    throw new CommandError("UNSUPPORTED_FILE", "binary file is not supported");
  }
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    throw new CommandError("UNSUPPORTED_FILE", "file is not valid UTF-8");
  }
}

async function readIgnoreFile(filePath: string): Promise<string | undefined> {
  try {
    return await fsReadFile(filePath, "utf8");
  } catch (error) {
    const value = error as NodeJS.ErrnoException;
    if (value.code === "ENOENT" || value.code === "ENOTDIR") return undefined;
    throw error;
  }
}

interface IgnoreMatcher {
  base: string;
  rules: Ignore;
}

async function buildIgnoreMatchers(
  root: string,
  directory: string,
): Promise<IgnoreMatcher[]> {
  const ancestors = [root];
  const relativeDirectory = path.relative(root, directory);
  if (relativeDirectory) {
    let current = root;
    for (const component of relativeDirectory.split(path.sep)) {
      current = path.join(current, component);
      ancestors.push(current);
    }
  }

  const matchers: IgnoreMatcher[] = [];
  const repositoryExclude = await readIgnoreFile(
    path.join(root, ".git", "info", "exclude"),
  );
  if (repositoryExclude) {
    matchers.push({ base: root, rules: ignore().add(repositoryExclude) });
  }
  for (const ancestor of ancestors) {
    const contents = await readIgnoreFile(path.join(ancestor, ".gitignore"));
    if (contents) {
      matchers.push({ base: ancestor, rules: ignore().add(contents) });
    }
  }
  return matchers;
}

function isIgnored(
  matchers: readonly IgnoreMatcher[],
  entryPath: string,
  isDirectory: boolean,
): boolean {
  let ignored = false;
  for (const matcher of matchers) {
    const relative = path
      .relative(matcher.base, entryPath)
      .split(path.sep)
      .join("/");
    const result = matcher.rules.test(isDirectory ? `${relative}/` : relative);
    if (result.ignored) ignored = true;
    if (result.unignored) ignored = false;
  }
  return ignored;
}

export class FilesystemService {
  constructor(private readonly rootResolver: RootResolver) {}

  async readDir(
    worktreeId: string,
    relativePath: string,
  ): Promise<FileEntry[]> {
    try {
      const rootPath = await this.rootResolver(worktreeId);
      const { root, path: directory } = await resolveProjectPath(
        rootPath,
        relativePath,
        true,
      );
      const directoryMetadata = await stat(directory);
      if (!directoryMetadata.isDirectory()) {
        throw new CommandError("INVALID_ARGUMENT", "path is not a directory");
      }

      const matchers = await buildIgnoreMatchers(root, directory);
      const directoryEntries = await readdir(directory, {
        withFileTypes: true,
      });
      const entries: FileEntry[] = [];
      for (const entry of directoryEntries) {
        const entryPath = path.join(directory, entry.name);
        const projectRelative = path.relative(root, entryPath);
        if (
          entry.name === ".git" ||
          isIgnored(matchers, entryPath, entry.isDirectory())
        )
          continue;

        try {
          await resolveProjectPath(root, projectRelative, true);
        } catch (error) {
          if (error instanceof CommandError && error.code === "OUTSIDE_PROJECT")
            continue;
          throw error;
        }

        const metadata = await lstat(entryPath);
        const kind: EntryKind = metadata.isSymbolicLink()
          ? "symlink"
          : metadata.isDirectory()
            ? "directory"
            : "file";
        entries.push({
          name: entry.name,
          relativePath: projectRelative,
          kind,
          ...(metadata.isFile() ? { size: metadata.size } : {}),
        });
      }

      return entries.sort((left, right) => {
        const leftDirectory = left.kind === "directory";
        const rightDirectory = right.kind === "directory";
        if (leftDirectory !== rightDirectory) return leftDirectory ? -1 : 1;
        return naturalCollator.compare(left.name, right.name);
      });
    } catch (error) {
      throw toCommandError(error);
    }
  }

  async readFile(
    worktreeId: string,
    relativePath: string,
  ): Promise<FileContent> {
    try {
      const root = await this.rootResolver(worktreeId);
      const { path: filePath } = await resolveProjectPath(
        root,
        relativePath,
        true,
      );
      const metadata = await stat(filePath);
      if (!metadata.isFile()) {
        throw new CommandError(
          "UNSUPPORTED_FILE",
          "path is not a regular file",
        );
      }
      if (metadata.size > MAX_TEXT_BYTES) {
        throw new CommandError(
          "FILE_TOO_LARGE",
          "file exceeds 5 MiB text limit",
        );
      }

      const bytes = await fsReadFile(filePath);
      const content = decodeTextFile(bytes);
      return {
        relativePath,
        content,
        size: metadata.size,
        version: fileVersion(bytes),
      };
    } catch (error) {
      throw toCommandError(error);
    }
  }

  async writeFile(
    worktreeId: string,
    relativePath: string,
    content: string,
    expectedVersion: string,
  ): Promise<FileContent> {
    let temporaryPath: string | undefined;
    try {
      const root = await this.rootResolver(worktreeId);
      const { path: filePath } = await resolveProjectPath(
        root,
        relativePath,
        true,
      );
      const metadata = await stat(filePath);
      if (!metadata.isFile()) {
        throw new CommandError(
          "UNSUPPORTED_FILE",
          "path is not a regular file",
        );
      }

      const currentBytes = await fsReadFile(filePath);
      if (currentBytes.byteLength > MAX_TEXT_BYTES) {
        throw new CommandError(
          "FILE_TOO_LARGE",
          "file exceeds 5 MiB text limit",
        );
      }
      decodeTextFile(currentBytes);
      if (fileVersion(currentBytes) !== expectedVersion) {
        throw new CommandError(
          "FILE_CONFLICT",
          "file changed on disk; reload it before saving",
        );
      }

      const nextBytes = Buffer.from(content, "utf8");
      if (nextBytes.byteLength > MAX_TEXT_BYTES) {
        throw new CommandError(
          "FILE_TOO_LARGE",
          "file exceeds 5 MiB text limit",
        );
      }

      temporaryPath = path.join(
        path.dirname(filePath),
        `.${path.basename(filePath)}.spirecode-${randomUUID()}.tmp`,
      );
      await fsWriteFile(temporaryPath, nextBytes, { flag: "wx" });
      await chmod(temporaryPath, metadata.mode);
      await rename(temporaryPath, filePath);
      temporaryPath = undefined;
      const savedMetadata = await stat(filePath);
      return {
        relativePath,
        content,
        size: savedMetadata.size,
        version: fileVersion(nextBytes),
      };
    } catch (error) {
      if (temporaryPath) await rm(temporaryPath, { force: true }).catch(() => {});
      throw toCommandError(error);
    }
  }
}
