import { CommandError } from "../../core/errors.js";
import type { GitChange, GitStatus, NumstatEntry } from "./types.js";

function malformed(message: string): never {
  throw new CommandError("GIT_FAILED", message);
}

function splitFields(record: string, count: number): string[] {
  const fields: string[] = [];
  let offset = 0;
  while (fields.length < count - 1) {
    const separator = record.indexOf(" ", offset);
    if (separator < 0) return [];
    fields.push(record.slice(offset, separator));
    offset = separator + 1;
  }
  fields.push(record.slice(offset));
  return fields;
}

function change(
  path: string,
  originalPath: string | null,
  xy: string,
): GitChange {
  if (xy.length !== 2) malformed("malformed porcelain status code");
  const [indexStatus = ".", worktreeStatus = "."] = xy;
  return {
    path,
    originalPath,
    staged: indexStatus !== ".",
    unstaged: worktreeStatus !== ".",
    untracked: false,
    status: xy,
    additions: null,
    deletions: null,
  };
}

export function parseStatus(value: string): GitStatus {
  const records = value.split("\0");
  if (records.at(-1) === "") records.pop();
  let branch: string | null = null;
  let upstream: string | null = null;
  let ahead = 0;
  let behind = 0;
  const changes: GitChange[] = [];

  for (let index = 0; index < records.length; index += 1) {
    const record = records[index] ?? "";
    if (record.startsWith("# branch.head ")) {
      const name = record.slice("# branch.head ".length);
      branch = name === "(detached)" ? null : name;
      continue;
    }
    if (record.startsWith("# branch.upstream ")) {
      upstream = record.slice("# branch.upstream ".length);
      continue;
    }
    if (record.startsWith("# branch.ab ")) {
      for (const token of record.slice("# branch.ab ".length).split(/\s+/u)) {
        if (/^\+\d+$/u.test(token)) ahead = Number(token.slice(1));
        if (/^-\d+$/u.test(token)) behind = Number(token.slice(1));
      }
      continue;
    }
    if (record.startsWith("? ")) {
      changes.push({
        path: record.slice(2),
        originalPath: null,
        staged: false,
        unstaged: false,
        untracked: true,
        status: "??",
        additions: null,
        deletions: null,
      });
      continue;
    }
    if (record.startsWith("! ")) continue;

    const kind = record[0];
    if (kind === "1" || kind === "u") {
      const fieldCount = kind === "1" ? 9 : 11;
      const fields = splitFields(record, fieldCount);
      if (
        fields.length !== fieldCount ||
        fields[0] !== kind ||
        !fields[1] ||
        !fields.at(-1)
      ) {
        malformed("malformed porcelain record");
      }
      changes.push(change(fields.at(-1)!, null, fields[1]!));
      continue;
    }
    if (kind === "2") {
      const fields = splitFields(record, 10);
      if (
        fields.length !== 10 ||
        fields[0] !== "2" ||
        !fields[1] ||
        !fields[9]
      ) {
        malformed("malformed rename record");
      }
      const originalPath = records[++index];
      if (originalPath === undefined) malformed("malformed rename record");
      changes.push(change(fields[9]!, originalPath, fields[1]!));
    }
  }

  const unique = new Map<string, GitChange>();
  for (const item of changes) {
    unique.set(
      `${item.path}\0${item.staged}\0${item.unstaged}\0${item.untracked}`,
      item,
    );
  }
  return {
    branch,
    upstream,
    ahead,
    behind,
    changes: [...unique.values()].sort((left, right) =>
      left.path < right.path ? -1 : left.path > right.path ? 1 : 0,
    ),
  };
}

function count(value: string): number | null {
  if (value === "-") return null;
  return /^\d+$/u.test(value) ? Number(value) : null;
}

export function parseNumstat(value: string): NumstatEntry[] {
  const records = value.split("\0");
  if (records.at(-1) === "") records.pop();
  const entries: NumstatEntry[] = [];

  for (let index = 0; index < records.length; index += 1) {
    const record = records[index] ?? "";
    const firstTab = record.indexOf("\t");
    const secondTab = record.indexOf("\t", firstTab + 1);
    if (firstTab < 0 || secondTab < 0) continue;
    let targetPath = record.slice(secondTab + 1);
    if (targetPath === "") {
      index += 2;
      const renamedPath = records[index];
      if (renamedPath === undefined) continue;
      targetPath = renamedPath;
    }
    entries.push({
      path: targetPath,
      additions: count(record.slice(0, firstTab)),
      deletions: count(record.slice(firstTab + 1, secondTab)),
    });
  }
  return entries;
}

export function applyNumstat(changes: GitChange[], output: string): void {
  for (const entry of parseNumstat(output)) {
    const item = changes.find((candidate) => candidate.path === entry.path);
    if (!item) continue;
    if (entry.additions !== null)
      item.additions = (item.additions ?? 0) + entry.additions;
    if (entry.deletions !== null)
      item.deletions = (item.deletions ?? 0) + entry.deletions;
  }
}
