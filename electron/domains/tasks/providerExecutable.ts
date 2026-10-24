import { constants } from "node:fs";
import { access, realpath, stat } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";

interface ProviderExecutableOptions {
  env?: NodeJS.ProcessEnv;
  platform?: NodeJS.Platform;
  homeDirectory?: string;
  resolve?: (candidate: string) => Promise<string>;
}

async function trustedExecutable(candidate: string): Promise<string> {
  await access(candidate, constants.X_OK);
  const resolved = await realpath(candidate);
  if (!(await stat(resolved)).isFile()) throw new Error("Not a file");
  if (process.platform !== "win32") {
    for (const location of [
      resolved,
      path.dirname(resolved),
      path.dirname(candidate),
    ]) {
      if (((await stat(location)).mode & 0o002) !== 0)
        throw new Error("World-writable executable location");
    }
  }
  return resolved;
}

export async function findProviderExecutable(
  executable: "gh" | "glab",
  options: ProviderExecutableOptions = {},
): Promise<string | null> {
  const env = options.env ?? process.env;
  const platform = options.platform ?? process.platform;
  const home = options.homeDirectory ?? homedir();
  const paths = platform === "win32" ? path.win32 : path.posix;
  const key = Object.keys(env).find((name) => name.toLowerCase() === "path");
  const directories = (env[key ?? "PATH"] ?? "")
    .split(platform === "win32" ? ";" : ":")
    .filter((directory) => paths.isAbsolute(directory));
  if (platform === "darwin")
    directories.push("/opt/homebrew/bin", "/usr/local/bin");
  if (platform === "win32") {
    const product = executable === "gh" ? "GitHub CLI" : "glab";
    if (env.ProgramFiles)
      directories.push(paths.join(env.ProgramFiles, product));
    if (env.LOCALAPPDATA)
      directories.push(paths.join(env.LOCALAPPDATA, "Programs", product));
    directories.push(paths.join(home, "scoop", "shims"));
  }
  const resolve = options.resolve ?? trustedExecutable;
  for (const directory of new Set(
    directories.filter((directory) => paths.isAbsolute(directory)),
  )) {
    try {
      return await resolve(
        paths.join(
          directory,
          platform === "win32" ? `${executable}.exe` : executable,
        ),
      );
    } catch {
      continue;
    }
  }
  return null;
}
