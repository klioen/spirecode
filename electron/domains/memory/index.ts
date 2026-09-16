import { constants } from "node:fs";
import { open, realpath, stat } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";
import { CommandError } from "../../core/errors.js";

export const MAX_MEMORY_DOCUMENT_BYTES = 2 * 1024 * 1024;
export type MemoryDocumentId = "summary" | "handbook";

export interface MemoryDocument {
  id: MemoryDocumentId;
  name: string;
  content: string;
  size: number;
  updatedAt: number;
}

const DOCUMENT_NAMES: Record<MemoryDocumentId, string> = {
  summary: "memory_summary.md",
  handbook: "MEMORY.md",
};

function defaultMemoryRoot(): string {
  const configured = process.env.PI_MEMORY_DIR?.trim();
  return configured || path.join(homedir(), ".pi", "agent", "memories");
}

function isContained(root: string, candidate: string): boolean {
  const relative = path.relative(root, candidate);
  return (
    relative !== "" &&
    !relative.startsWith(`..${path.sep}`) &&
    relative !== ".." &&
    !path.isAbsolute(relative)
  );
}

function safeFilesystemError(error: unknown): CommandError {
  if (error instanceof CommandError) return error;
  const code =
    error && typeof error === "object" && "code" in error
      ? (error as NodeJS.ErrnoException).code
      : undefined;
  if (code === "ENOENT" || code === "ENOTDIR")
    return new CommandError(
      "NOT_FOUND",
      "memory document has not been generated",
    );
  if (code === "EACCES" || code === "EPERM")
    return new CommandError(
      "PERMISSION_DENIED",
      "memory document cannot be read",
    );
  if (code === "ELOOP")
    return new CommandError(
      "OUTSIDE_MEMORY",
      "memory document symlinks are not allowed",
    );
  return new CommandError("INVALID_ARGUMENT", "unable to read memory document");
}

export class MemoryService {
  constructor(private readonly configuredRoot?: string) {}

  async read(id: MemoryDocumentId): Promise<MemoryDocument> {
    try {
      const name = DOCUMENT_NAMES[id];
      if (!name)
        throw new CommandError(
          "INVALID_ARGUMENT",
          "memory document is invalid",
        );

      const requestedRoot = path.resolve(
        this.configuredRoot ?? defaultMemoryRoot(),
      );
      const root = await realpath(requestedRoot);
      const rootMetadata = await stat(root);
      if (!rootMetadata.isDirectory())
        throw new CommandError(
          "INVALID_ARGUMENT",
          "memory root is not a directory",
        );
      const requestedFile = path.join(root, name);
      const resolvedFile = await realpath(requestedFile);
      if (!isContained(root, resolvedFile))
        throw new CommandError(
          "OUTSIDE_MEMORY",
          "memory document escapes the memory root",
        );

      const handle = await open(
        requestedFile,
        constants.O_RDONLY | constants.O_NOFOLLOW,
      );
      try {
        const metadata = await handle.stat();
        if (!metadata.isFile())
          throw new CommandError(
            "UNSUPPORTED_FILE",
            "memory document is not a regular file",
          );
        if (metadata.size > MAX_MEMORY_DOCUMENT_BYTES)
          throw new CommandError(
            "FILE_TOO_LARGE",
            "memory document exceeds 2 MiB limit",
          );

        const currentRootMetadata = await stat(root);
        const currentPath = await realpath(requestedFile);
        const currentMetadata = await stat(currentPath);
        if (
          currentRootMetadata.dev !== rootMetadata.dev ||
          currentRootMetadata.ino !== rootMetadata.ino ||
          !isContained(root, currentPath) ||
          currentMetadata.dev !== metadata.dev ||
          currentMetadata.ino !== metadata.ino
        )
          throw new CommandError(
            "OUTSIDE_MEMORY",
            "memory document changed during validation",
          );

        const buffer = Buffer.alloc(MAX_MEMORY_DOCUMENT_BYTES + 1);
        const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0);
        if (bytesRead > MAX_MEMORY_DOCUMENT_BYTES)
          throw new CommandError(
            "FILE_TOO_LARGE",
            "memory document exceeds 2 MiB limit",
          );
        const bytes = buffer.subarray(0, bytesRead);
        if (bytes.includes(0))
          throw new CommandError(
            "UNSUPPORTED_FILE",
            "binary memory document is not supported",
          );

        let content: string;
        try {
          content = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
        } catch {
          throw new CommandError(
            "UNSUPPORTED_FILE",
            "memory document is not valid UTF-8",
          );
        }

        return {
          id,
          name,
          content,
          size: bytesRead,
          updatedAt: metadata.mtimeMs,
        };
      } finally {
        await handle.close();
      }
    } catch (error) {
      throw safeFilesystemError(error);
    }
  }
}
