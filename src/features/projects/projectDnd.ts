import type { SortingStrategy } from "@dnd-kit/sortable";
import type { ProjectSummary } from "../../bindings";

const PROJECT_PREFIX = "project:";
const GROUP_PREFIX = "group:";
const UNGROUPED_TOKEN = "ungrouped";

export interface ProjectMoveIntent {
  projectId: string;
  targetGroupId: string | null;
  beforeProjectId: string | null;
}

export type ProjectDropTarget =
  | { type: "project"; projectId: string }
  | { type: "group"; groupId: string | null };

export const staticProjectSortingStrategy: SortingStrategy = () => null;

export const projectDragId = (projectId: string) =>
  `${PROJECT_PREFIX}${projectId}`;

export const groupDropId = (groupId: string | null) =>
  `${GROUP_PREFIX}${groupId ?? UNGROUPED_TOKEN}`;

export function resolveProjectDropTarget(id: string): ProjectDropTarget | null {
  if (id.startsWith(PROJECT_PREFIX)) {
    return { type: "project", projectId: id.slice(PROJECT_PREFIX.length) };
  }
  if (id.startsWith(GROUP_PREFIX)) {
    const groupId = id.slice(GROUP_PREFIX.length);
    return {
      type: "group",
      groupId: groupId === UNGROUPED_TOKEN ? null : groupId,
    };
  }
  return null;
}

export function projectMoveIntent(
  projects: ProjectSummary[],
  projectId: string,
  target: ProjectDropTarget,
  placeAfter = false,
): ProjectMoveIntent | null {
  const source = projects.find((project) => project.id === projectId);
  if (!source) return null;

  if (target.type === "group") {
    return {
      projectId,
      targetGroupId: target.groupId,
      beforeProjectId: null,
    };
  }

  const over = projects.find((project) => project.id === target.projectId);
  if (!over || over.id === projectId) return null;
  const destination = projects.filter(
    (project) => project.id !== projectId && project.groupId === over.groupId,
  );
  const overIndex = destination.findIndex((project) => project.id === over.id);
  if (overIndex < 0) return null;
  return {
    projectId,
    targetGroupId: over.groupId,
    beforeProjectId: placeAfter
      ? (destination[overIndex + 1]?.id ?? null)
      : over.id,
  };
}

export function previewProjectMove(
  projects: ProjectSummary[],
  intent: ProjectMoveIntent,
): ProjectSummary[] {
  const source = projects.find((project) => project.id === intent.projectId);
  if (!source) return projects;
  const withoutSource = projects.filter(
    (project) => project.id !== intent.projectId,
  );
  const moved = { ...source, groupId: intent.targetGroupId };
  let insertAt = withoutSource.length;
  if (intent.beforeProjectId) {
    insertAt = withoutSource.findIndex(
      (project) =>
        project.id === intent.beforeProjectId &&
        project.groupId === intent.targetGroupId,
    );
    if (insertAt < 0) return projects;
  } else {
    for (let index = withoutSource.length - 1; index >= 0; index -= 1) {
      if (withoutSource[index]?.groupId === intent.targetGroupId) {
        insertAt = index + 1;
        break;
      }
    }
  }
  const next = [...withoutSource];
  next.splice(insertAt, 0, moved);
  return next;
}
