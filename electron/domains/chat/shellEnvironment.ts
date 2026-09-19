import { execFile } from "node:child_process";

const VALUE_START = "\x1eSPIRECODE_ARK_API_KEY\x1f";
const VALUE_END = "\x1e";
const READ_ARK_API_KEY =
  'printf "\\036SPIRECODE_ARK_API_KEY\\037%s\\036" "${ARK_API_KEY-}"';

type ShellRunner = (file: string, args: readonly string[]) => Promise<Buffer>;

export async function bootstrapArkApiKeyFromLoginShell(
  env: Record<string, string | undefined> = process.env,
  run: ShellRunner = runShell,
  platform: NodeJS.Platform = process.platform,
): Promise<boolean> {
  if (env.ARK_API_KEY || platform !== "darwin") return false;
  let output: Buffer;
  try {
    output = await run("/bin/zsh", ["-ilc", READ_ARK_API_KEY]);
  } catch {
    return false;
  }
  const value = parseMarkedValue(output);
  if (!value) return false;
  env.ARK_API_KEY = value;
  return true;
}

function runShell(file: string, args: readonly string[]): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    execFile(
      file,
      [...args],
      { encoding: "buffer", timeout: 5_000, maxBuffer: 256 * 1024 },
      (error, stdout) => {
        if (error) reject(error);
        else resolve(Buffer.isBuffer(stdout) ? stdout : Buffer.from(stdout));
      },
    );
  });
}

function parseMarkedValue(output: Buffer): string | undefined {
  const text = output.toString("utf8");
  const start = text.lastIndexOf(VALUE_START);
  if (start < 0) return undefined;
  const valueStart = start + VALUE_START.length;
  const end = text.indexOf(VALUE_END, valueStart);
  if (end < 0) return undefined;
  return text.slice(valueStart, end) || undefined;
}
