import { commands } from "../../bindings";
export const projectsApi = {
  list: commands.projectList,
  catalog: commands.projectCatalog,
  openDialog: commands.projectOpenDialog,
  close: commands.projectClose,
  reveal: commands.projectReveal,
  listOriginBranches: commands.gitListOriginBranches,
  createWorktree: commands.worktreeCreate,
  selectWorktree: commands.worktreeSelect,
  listWorktrees: commands.worktreeList,
  revealWorktree: commands.worktreeReveal,
  renameWorktree: commands.worktreeRename,
  inspectDeleteWorktree: commands.worktreeInspectDelete,
  deleteWorktree: commands.worktreeDelete,
};
