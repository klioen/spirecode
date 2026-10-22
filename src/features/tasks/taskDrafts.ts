import type { CreateTaskInput } from "./tasksApi";

export interface TaskFormDraft extends Omit<CreateTaskInput, "workspace"> {
  workspaceMode: "new_managed" | "existing";
  baseRef: string;
  worktreeId: string;
}

export const TASK_DRAFT_LIMIT = 20;
const drafts = new Map<string, TaskFormDraft>();
let recentProjectId = "";
const listeners = new Set<() => void>();
function changed(): void {
  listeners.forEach((listener) => listener());
}
export function taskDraftCount(): number {
  return drafts.size;
}
export function subscribeTaskDrafts(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
export const newTaskDraftKey = "new";
export function readTaskDraft(key: string): TaskFormDraft | undefined {
  return drafts.get(key);
}
export function saveTaskDraft(key: string, draft: TaskFormDraft): boolean {
  if (!drafts.has(key) && drafts.size >= TASK_DRAFT_LIMIT) return false;
  const {
    title,
    description,
    projectId,
    workspaceMode,
    baseRef,
    worktreeId,
    automationEnabled,
  } = draft;
  drafts.set(key, {
    title,
    description,
    projectId,
    workspaceMode,
    baseRef,
    worktreeId,
    automationEnabled,
  });
  recentProjectId = draft.projectId;
  changed();
  return true;
}
export function clearTaskDraft(key: string): void {
  if (drafts.delete(key)) changed();
}
export function lastTaskProjectId(): string {
  return recentProjectId;
}
export function resetTaskDrafts(): void {
  drafts.clear();
  recentProjectId = "";
  changed();
}
