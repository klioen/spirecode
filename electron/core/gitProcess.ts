import { spawn } from "node:child_process";
import { CommandError, toCommandError } from "./errors.js";

const MAX_OUTPUT = 20 * 1024 * 1024;
const TIMEOUT_MS = 15_000;
const SAFE_CONFIG = [
  "-c",
  "core.hooksPath=/dev/null",
  "-c",
  "credential.helper=",
  "-c",
  "protocol.ext.allow=never",
];

export interface ProcessOutput {
  stdout: Buffer;
  stderr: Buffer;
  exitCode: number;
}

export interface GitRunOptions {
  timeoutMs?: number;
  maxOutput?: number;
  diffSafe?: boolean;
  allowFailure?: boolean;
}

export async function runGit(
  cwd: string,
  args: readonly string[],
  options: GitRunOptions = {},
): Promise<ProcessOutput> {
  const timeoutMs = options.timeoutMs ?? TIMEOUT_MS;
  const maxOutput = options.maxOutput ?? MAX_OUTPUT;
  const config = options.diffSafe
    ? [...SAFE_CONFIG, "-c", "diff.external="]
    : SAFE_CONFIG;

  return new Promise((resolve, reject) => {
    const child = spawn("git", [...config, ...args], {
      cwd,
      shell: false,
      stdio: ["ignore", "pipe", "pipe"],
    });
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];
    let stdoutBytes = 0;
    let stderrBytes = 0;
    let settled = false;

    const fail = (error: unknown) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      child.kill("SIGKILL");
      reject(toCommandError(error));
    };
    const collect =
      (chunks: Buffer[], stream: "stdout" | "stderr") => (chunk: Buffer) => {
        if (stream === "stdout") stdoutBytes += chunk.length;
        else stderrBytes += chunk.length;
        if (stdoutBytes > maxOutput || stderrBytes > maxOutput) {
          fail(
            new CommandError("GIT_FAILED", "Git output exceeded 20 MiB limit"),
          );
          return;
        }
        chunks.push(chunk);
      };

    child.stdout.on("data", collect(stdout, "stdout"));
    child.stderr.on("data", collect(stderr, "stderr"));
    child.on("error", fail);
    child.on("close", (code, signal) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      const output = {
        stdout: Buffer.concat(stdout),
        stderr: Buffer.concat(stderr),
        exitCode: code ?? -1,
      };
      if (code === 0 || options.allowFailure) {
        resolve(output);
        return;
      }
      reject(
        new CommandError(
          "GIT_FAILED",
          output.stderr.toString("utf8").trim() || "Git command failed",
          { exitCode: code === null ? (signal ?? "signal") : String(code) },
        ),
      );
    });

    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      child.kill("SIGKILL");
      reject(new CommandError("GIT_TIMED_OUT", "Git command timed out"));
    }, timeoutMs);
  });
}

export async function gitText(
  cwd: string,
  args: readonly string[],
  options?: GitRunOptions,
): Promise<string> {
  const output = await runGit(cwd, args, options);
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(output.stdout);
  } catch {
    throw new CommandError("GIT_FAILED", "Git returned non-UTF-8 output");
  }
}
