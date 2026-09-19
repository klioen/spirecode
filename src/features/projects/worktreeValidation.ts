export const WORKTREE_NAME_PATTERN =
  /^[A-Za-z0-9](?:[A-Za-z0-9_-]{0,46}[A-Za-z0-9])?$/;

export type WorktreeNameValidation = "required" | "tooLong" | "pattern";

export function validateWorktreeName(
  value: string,
): WorktreeNameValidation | null {
  const name = value.trim();
  if (!name) return "required";
  if (name.length > 48) return "tooLong";
  if (!WORKTREE_NAME_PATTERN.test(name)) return "pattern";
  return null;
}
