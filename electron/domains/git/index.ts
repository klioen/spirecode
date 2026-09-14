export { GitService, runSafeGit } from "./service.js";
export { applyNumstat, parseNumstat, parseStatus } from "./parser.js";
export { safeGitObjectExists, safeGitText } from "./safeRunner.js";
export type {
  DiffScope,
  GitChange,
  GitDiff,
  GitStatus,
  NumstatEntry,
} from "./types.js";
export type { RootResolver } from "./service.js";
export type { SafeGitRunOptions } from "./safeRunner.js";
