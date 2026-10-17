import type { DiffScope, GitChange, GitStatus } from "../../bindings";

export type ChangeSectionId = "conflicts" | "staged" | "unstaged" | "untracked";

export interface ProjectedChange {
  key: string;
  section: ChangeSectionId;
  scope: DiffScope;
  change: GitChange;
  status: "M" | "A" | "D" | "R" | "U" | "C";
  canStage: boolean;
  canUnstage: boolean;
  canDiscard: boolean;
}

export interface ChangeSection {
  id: ChangeSectionId;
  rows: ProjectedChange[];
}

export const isConflictStatus = (status: string) =>
  /^(?:DD|AU|UD|UA|DU|AA|UU)$/u.test(status);

const statusFor = (
  change: GitChange,
  section: ChangeSectionId,
): ProjectedChange["status"] => {
  if (section === "conflicts") return "C";
  if (section === "untracked") return "U";
  const value =
    section === "staged" ? change.status.charAt(0) : change.status.charAt(1);
  return value === "A" || value === "D" || value === "R" ? value : "M";
};

const row = (
  change: GitChange,
  section: ChangeSectionId,
  scope: DiffScope,
): ProjectedChange => ({
  key: `${section}:${change.path}`,
  section,
  scope,
  change,
  status: statusFor(change, section),
  canStage: section === "unstaged" || section === "untracked",
  canUnstage: section === "staged",
  canDiscard: section === "unstaged" || section === "untracked",
});

export function projectChanges(
  snapshot: GitStatus,
  query: string,
): ChangeSection[] {
  const normalized = query.trim().toLocaleLowerCase();
  const matches = (change: GitChange) =>
    !normalized ||
    change.path.toLocaleLowerCase().includes(normalized) ||
    (change.originalPath ?? "").toLocaleLowerCase().includes(normalized);
  const visible = snapshot.changes.filter(matches);
  const conflicts = visible.filter((change) => isConflictStatus(change.status));
  const ordinary = visible.filter((change) => !isConflictStatus(change.status));
  return [
    {
      id: "conflicts",
      rows: conflicts.map((change) => row(change, "conflicts", "unstaged")),
    },
    {
      id: "staged",
      rows: ordinary
        .filter((change) => change.staged)
        .map((change) => row(change, "staged", "staged")),
    },
    {
      id: "unstaged",
      rows: ordinary
        .filter((change) => change.unstaged && !change.untracked)
        .map((change) => row(change, "unstaged", "unstaged")),
    },
    {
      id: "untracked",
      rows: ordinary
        .filter((change) => change.untracked)
        .map((change) => row(change, "untracked", "untracked")),
    },
  ];
}
