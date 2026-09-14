export const WORKTREE_NAME_PATTERN =
  /^[A-Za-z0-9](?:[A-Za-z0-9_-]{0,46}[A-Za-z0-9])?$/;

export function validateWorktreeName(value: string): string | null {
  const name = value.trim();
  if (!name) return "Worktree name is required.";
  if (name.length > 48) return "Use 48 characters or fewer.";
  if (!WORKTREE_NAME_PATTERN.test(name))
    return "Use letters, numbers, hyphens, or underscores; start and end with a letter or number.";
  return null;
}
