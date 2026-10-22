import { readFile, stat } from "node:fs/promises";
import type { TaskRun } from "./types.js";

interface CachedTokenCount {
  size: number;
  modifiedAt: number;
  tokenCount: number;
}

function nonNegativeNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value >= 0
    ? value
    : null;
}

export interface SessionTokenWindow {
  startedAt: number;
  endedAt: number;
}

export function parseSessionTokenCount(
  contents: string,
  window?: SessionTokenWindow,
): number {
  let tokenCount = 0;
  for (const line of contents.split("\n")) {
    if (!line.trim()) continue;
    try {
      const entry = JSON.parse(line) as {
        type?: unknown;
        timestamp?: unknown;
        usage?: Record<string, unknown>;
        message?: { role?: unknown; usage?: Record<string, unknown> };
      };
      if (window) {
        const timestamp =
          typeof entry.timestamp === "string"
            ? Date.parse(entry.timestamp)
            : nonNegativeNumber(entry.timestamp);
        if (
          timestamp === null ||
          !Number.isFinite(timestamp) ||
          timestamp < window.startedAt ||
          timestamp >= window.endedAt
        )
          continue;
      }
      const usage =
        entry.type === "message" && entry.message?.role === "assistant"
          ? entry.message.usage
          : ["usage", "compaction", "branch_summary"].includes(
                String(entry.type),
              )
            ? entry.usage
            : undefined;
      if (!usage) continue;
      const total = nonNegativeNumber(usage.totalTokens);
      if (total !== null) {
        tokenCount += total;
        continue;
      }
      for (const key of ["input", "output", "cacheRead", "cacheWrite"])
        tokenCount += nonNegativeNumber(usage[key]) ?? 0;
    } catch {
      // An interrupted final JSONL write must not hide metrics from prior messages.
    }
  }
  return Math.round(tokenCount);
}

export function taskRunDurationMs(run: TaskRun, now = Date.now()): number {
  if (run.startedAt === null) return 0;
  let end: number;
  if (run.finishedAt !== null) end = run.finishedAt;
  else if (run.status === "awaiting_report" && run.settledAt !== null)
    end = run.settledAt;
  else end = now;
  return Math.max(0, end - run.startedAt);
}

export class TaskSessionMetricsReader {
  readonly #cache = new Map<string, CachedTokenCount>();

  async tokenCount(
    sessionPath: string | null,
    window?: SessionTokenWindow,
  ): Promise<number> {
    if (!sessionPath) return 0;
    try {
      const metadata = await stat(sessionPath);
      if (!metadata.isFile()) return 0;
      const cacheKey = window
        ? `${sessionPath}:${window.startedAt}:${window.endedAt}`
        : sessionPath;
      const cached = this.#cache.get(cacheKey);
      if (
        cached?.size === metadata.size &&
        cached.modifiedAt === metadata.mtimeMs
      )
        return cached.tokenCount;
      const tokenCount = parseSessionTokenCount(
        await readFile(sessionPath, "utf8"),
        window,
      );
      this.#cache.set(cacheKey, {
        size: metadata.size,
        modifiedAt: metadata.mtimeMs,
        tokenCount,
      });
      return tokenCount;
    } catch {
      return 0;
    }
  }
}
