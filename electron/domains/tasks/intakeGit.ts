import { safeGitText } from "../git/safeRunner.js";

const COMMIT = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/;
const MAX_FILE_BYTES = 256 * 1024;
const MAX_TREE_BYTES = 4 * 1024 * 1024;

export function validateIntakeCommit(value: unknown): string {
  if (typeof value !== "string" || !COMMIT.test(value))
    throw new Error("Invalid task baseline commit");
  return value;
}

export async function resolveIntakeCommit(root: string, baseRef: string) {
  if (!baseRef.startsWith("origin/") || /[\s\0]/.test(baseRef))
    throw new Error("Task baseline must be an allowed origin branch");
  return validateIntakeCommit(
    (
      await safeGitText(root, [
        "rev-parse",
        "--verify",
        "--end-of-options",
        `refs/remotes/${baseRef}^{commit}`,
      ])
    ).trim(),
  );
}

interface BlobEntry {
  path: string;
  oid: string;
}

export async function intakeTree(
  root: string,
  commit: string,
): Promise<BlobEntry[]> {
  validateIntakeCommit(commit);
  const output = await safeGitText(root, ["ls-tree", "-r", "-z", commit], {
    maxOutput: MAX_TREE_BYTES,
  });
  return output.split("\0").flatMap((record) => {
    const match =
      /^(100644|100755) blob ([0-9a-f]{40}|[0-9a-f]{64})\t([\s\S]+)$/.exec(
        record,
      );
    return match ? [{ oid: match[2], path: match[3] }] : [];
  });
}

export function validateIntakePath(value: unknown): string {
  if (
    typeof value !== "string" ||
    !value ||
    value.length > 4096 ||
    /[\0\\]/.test(value) ||
    value.startsWith("/") ||
    /^[A-Za-z]:/.test(value) ||
    value.split("/").some((part) => !part || part === "." || part === "..")
  )
    throw new Error("Use a project-relative file path without traversal");
  return value;
}

export async function readIntakeFile(
  root: string,
  commit: string,
  filePath: unknown,
): Promise<string> {
  const relativePath = validateIntakePath(filePath);
  const entry = (await intakeTree(root, commit)).find(
    (item) => item.path === relativePath,
  );
  if (!entry)
    throw new Error(
      "File is not a regular file in the task baseline (symlinks and submodules are excluded)",
    );
  const size = Number(
    (await safeGitText(root, ["cat-file", "-s", entry.oid])).trim(),
  );
  if (!Number.isSafeInteger(size) || size > MAX_FILE_BYTES)
    throw new Error("Baseline file exceeds 256 KiB; narrow the investigation");
  const text = await safeGitText(root, ["cat-file", "blob", entry.oid], {
    maxOutput: MAX_FILE_BYTES,
  });
  if (text.includes("\0"))
    throw new Error("Binary files cannot be read during clarification");
  return text;
}

export async function searchIntakeFiles(
  root: string,
  commit: string,
  query: string,
  prefix: string,
) {
  if (!query || query.length > 512 || /[\0\r\n]/.test(query))
    throw new Error("Provide a bounded, single-line literal search query");
  const entries = (await intakeTree(root, commit))
    .filter((item) => item.path.startsWith(prefix))
    .slice(0, 100);
  const matches: Array<{ path: string; line: number; text: string }> = [];
  for (const entry of entries) {
    const size = Number(
      (await safeGitText(root, ["cat-file", "-s", entry.oid])).trim(),
    );
    if (!Number.isSafeInteger(size) || size > 64 * 1024) continue;
    const text = await safeGitText(root, ["cat-file", "blob", entry.oid], {
      maxOutput: 64 * 1024,
    }).catch(() => "");
    if (text.includes("\0")) continue;
    for (const [index, line] of text.split(/\r?\n/).entries()) {
      if (line.includes(query))
        matches.push({
          path: entry.path,
          line: index + 1,
          text: line.slice(0, 512),
        });
      if (matches.length >= 100) return { matches, bounded: true };
    }
  }
  return { matches, bounded: true };
}
