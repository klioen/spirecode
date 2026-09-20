import { appendFile, mkdir, readFile, rename, stat } from "node:fs/promises";
import { shell } from "electron";
import os from "node:os";
import path from "node:path";

const MAX_LOG_BYTES = 2 * 1024 * 1024;
const MAX_DIAGNOSTICS_LOG_BYTES = 64 * 1024;
const SENSITIVE_ASSIGNMENT =
  /(["']?(?:api[_ -]?key|access[_ -]?token|refresh[_ -]?token|token|secret|password|credential)["']?\s*[:=]\s*["']?)[^\s,"']+/gi;
const BEARER = /(authorization\s*:\s*bearer\s+)[^\s,]+/gi;
const JWT = /\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g;
const URL_CREDENTIALS = /(https?:\/\/)[^\s/@:]+:[^\s/@]+@/gi;
const PRIVATE_KEY =
  /-----BEGIN [^-\r\n]*PRIVATE KEY-----[\s\S]*?-----END [^-\r\n]*PRIVATE KEY-----/g;
const WINDOWS_USER_PATH = /\b[A-Za-z]:\\Users\\[^\\\s]+(?:\\[^\s,;:]*)*/gi;

export interface DiagnosticEvent {
  level: "info" | "warn" | "error";
  code: string;
  safeContext?: Readonly<{
    errorType?: string;
  }>;
}

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
  async log(event: DiagnosticEvent): Promise<void> {
    try {
      await mkdir(this.logsDirectory, { recursive: true });
      try {
        if ((await stat(this.logPath)).size >= MAX_LOG_BYTES)
          await rename(this.logPath, `${this.logPath}.1`);
      } catch {
        /* first log */
      }
      const errorType = event.safeContext?.errorType;
      const safeContext =
        typeof errorType === "string" &&
        /^[A-Za-z][A-Za-z0-9_.-]{0,63}$/.test(errorType)
          ? { errorType }
          : undefined;
      const entry = {
        timestamp: new Date().toISOString(),
        level: event.level,
        code: event.code,
        ...(safeContext ? { safeContext } : {}),
      };
      await appendFile(
        this.logPath,
        `${sanitize(JSON.stringify(entry))}\n`,
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
export const sanitize = (value: string): string => {
  const home = os.homedir();
  return value
    .replace(PRIVATE_KEY, "[REDACTED PRIVATE KEY]")
    .replace(BEARER, "$1[REDACTED]")
    .replace(JWT, "[REDACTED JWT]")
    .replace(URL_CREDENTIALS, "$1[REDACTED]@")
    .replace(SENSITIVE_ASSIGNMENT, "$1[REDACTED]")
    .replace(/\b(?:sk|key|token)_[A-Za-z0-9_-]+\b/g, "[REDACTED]")
    .replaceAll(home, "<home>")
    .replace(WINDOWS_USER_PATH, "<home>");
};
