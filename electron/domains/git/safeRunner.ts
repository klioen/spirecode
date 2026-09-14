import { CommandError } from "../../core/errors.js";
import {
  runGit,
  type GitRunOptions,
  type ProcessOutput,
} from "../../core/gitProcess.js";

export type SafeGitRunOptions = Omit<GitRunOptions, "diffSafe">;

export async function runSafeGit(
  root: string,
  args: readonly string[],
  options: SafeGitRunOptions = {},
): Promise<ProcessOutput> {
  return runGit(root, args, { ...options, diffSafe: true });
}

export async function safeGitText(
  root: string,
  args: readonly string[],
  options: SafeGitRunOptions = {},
): Promise<string> {
  const output = await runSafeGit(root, args, options);
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(output.stdout);
  } catch {
    throw new CommandError("UNSUPPORTED_FILE", "Git object is not valid UTF-8");
  }
}

export async function safeGitObjectExists(
  root: string,
  spec: string,
): Promise<boolean> {
  const output = await runSafeGit(root, ["cat-file", "-e", spec], {
    allowFailure: true,
  });
  return output.exitCode === 0;
}
