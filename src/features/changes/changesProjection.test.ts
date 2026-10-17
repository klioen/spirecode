import { describe, expect, it } from "vitest";
import type { GitStatus } from "../../bindings";
import { projectChanges } from "./changesProjection";

const snapshot: GitStatus = {
  branch: "main",
  upstream: null,
  ahead: 0,
  behind: 0,
  changes: [
    {
      path: "src/both.ts",
      originalPath: null,
      status: "MM",
      staged: true,
      unstaged: true,
      untracked: false,
      additions: 3,
      deletions: 1,
    },
    {
      path: "src/conflict.ts",
      originalPath: null,
      status: "UU",
      staged: true,
      unstaged: true,
      untracked: false,
      additions: null,
      deletions: null,
    },
    {
      path: "src/new-name.ts",
      originalPath: "src/old-name.ts",
      status: "R.",
      staged: true,
      unstaged: false,
      untracked: false,
      additions: 0,
      deletions: 0,
    },
    {
      path: "notes.txt",
      originalPath: null,
      status: "??",
      staged: false,
      unstaged: false,
      untracked: true,
      additions: null,
      deletions: null,
    },
  ],
};

describe("changes projection", () => {
  it("places conflicts first and projects partially staged files twice", () => {
    const sections = projectChanges(snapshot, "");
    expect(sections.map(({ id }) => id)).toEqual([
      "conflicts",
      "staged",
      "unstaged",
      "untracked",
    ]);
    expect(sections[0]?.rows.map(({ change }) => change.path)).toEqual([
      "src/conflict.ts",
    ]);
    expect(sections[1]?.rows.map(({ key }) => key)).toContain(
      "staged:src/both.ts",
    );
    expect(sections[2]?.rows.map(({ key }) => key)).toEqual([
      "unstaged:src/both.ts",
    ]);
  });

  it("filters by current and original path without changing action scope", () => {
    const [conflicts, staged] = projectChanges(snapshot, "old-name");
    expect(conflicts?.rows).toEqual([]);
    expect(staged?.rows).toEqual([
      expect.objectContaining({
        scope: "staged",
        status: "R",
        canUnstage: true,
      }),
    ]);
  });
});
