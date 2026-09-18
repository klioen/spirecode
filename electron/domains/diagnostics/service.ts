import { appendFile, mkdir, readFile, rename, stat } from "node:fs/promises";
import { shell } from "electron";
import path from "node:path";

const MAX_LOG_BYTES = 2 * 1024 * 1024;
const MAX_DIAGNOSTICS_LOG_BYTES = 64 * 1024;
const SENSITIVE =
  /(api[_ -]?key|access[_ -]?token|secret|password|credential)\s*[:=]\s*[^\s,]+/gi;

export class DiagnosticsService {
  readonly logsDirectory: string;
  private readonly logPath: string;
  constructor(
    dataDirectory: string,
    private readonly version: string,
  ) {
    this.logsDirectory = path.join(dataDirectory, "logs");
    this.logPath = path.join(this.logsDirectory, "spirecode.log");
  }
  async log(message: string): Promise<void> {
    try {
      await mkdir(this.logsDirectory, { recursive: true });
      try {
        if ((await stat(this.logPath)).size >= MAX_LOG_BYTES)
          await rename(this.logPath, `${this.logPath}.1`);
      } catch {
        /* first log */
      }
      await appendFile(
        this.logPath,
        `${new Date().toISOString()} ${sanitize(message)}\n`,
        "utf8",
      );
    } catch {
      /* diagnostics must never break the app */
    }
  }
  async revealLogs(): Promise<void> {
    const error = await shell.openPath(this.logsDirectory);
    if (error) throw new Error(error);
  }
  async openFeedback(): Promise<void> {
    await shell.openExternal("https://github.com/klioen/spirecode/issues");
  }
  async copyText(): Promise<string> {
    let tail = "(no log available)";
    try {
      const content = await readFile(this.logPath, "utf8");
      tail = content.slice(-MAX_DIAGNOSTICS_LOG_BYTES);
    } catch {
      /* use empty tail */
    }
    return [
      "SpireCode diagnostics",
      `version=${this.version}`,
      `platform=${process.platform}`,
      `arch=${process.arch}`,
      `electron=${process.versions.electron ?? "unknown"}`,
      `node=${process.versions.node}`,
      "logs:",
      sanitize(tail),
    ].join("\n");
  }
}
export const sanitize = (value: string): string =>
  value
    .replace(SENSITIVE, "$1=[REDACTED]")
    .replace(/\b(?:sk|key|token)_[A-Za-z0-9_-]+\b/g, "[REDACTED]");
