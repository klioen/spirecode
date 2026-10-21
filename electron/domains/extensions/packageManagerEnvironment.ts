import { access, readdir } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";

interface NpmPathOptions {
  env?: NodeJS.ProcessEnv;
  homeDirectory?: string;
  platform?: NodeJS.Platform;
  access?: (candidate: string) => Promise<void>;
  readDirectory?: (directory: string) => Promise<string[]>;
  executableDirectory?: string;
}

export async function ensureNpmOnPath(
  options: NpmPathOptions = {},
): Promise<void> {
  const env = options.env ?? process.env;
  const homeDirectory = options.homeDirectory ?? homedir();
  const platform = options.platform ?? process.platform;
  const checkAccess = options.access ?? ((candidate) => access(candidate));
  const readDirectory =
    options.readDirectory ??
    (async (directory) =>
      readdir(directory, { withFileTypes: true }).then((entries) =>
        entries
          .filter((entry) => entry.isDirectory())
          .map((entry) => entry.name),
      ));
  const executableDirectory =
    options.executableDirectory ?? path.dirname(process.execPath);
  const platformPath = platform === "win32" ? path.win32 : path.posix;
  const delimiter = platform === "win32" ? ";" : ":";
  const pathKey =
    Object.keys(env).find((key) => key.toLowerCase() === "path") ?? "PATH";
  const currentPath = env[pathKey] ?? "";
  const currentDirectories = currentPath.split(delimiter).filter(Boolean);
  const npmExecutable = platform === "win32" ? "npm.cmd" : "npm";
  const nodeExecutable = platform === "win32" ? "node.exe" : "node";

  if (
    (await containsExecutable(
      currentDirectories,
      npmExecutable,
      checkAccess,
      platformPath,
    )) &&
    (await containsExecutable(
      currentDirectories,
      nodeExecutable,
      checkAccess,
      platformPath,
    ))
  )
    return;

  const candidates = await candidateDirectories({
    env,
    homeDirectory,
    platform,
    executableDirectory,
    readDirectory,
  });
  for (const directory of candidates) {
    if (
      (await isAccessible(
        platformPath.join(directory, npmExecutable),
        checkAccess,
      )) &&
      (await isAccessible(
        platformPath.join(directory, nodeExecutable),
        checkAccess,
      ))
    ) {
      env[pathKey] = [directory, currentPath].filter(Boolean).join(delimiter);
      return;
    }
  }

  throw new Error(
    "npm executable was not found. Install Node.js or configure npmCommand in ~/.pi/agent/settings.json.",
  );
}

async function candidateDirectories(options: {
  env: NodeJS.ProcessEnv;
  homeDirectory: string;
  platform: NodeJS.Platform;
  executableDirectory: string;
  readDirectory: (directory: string) => Promise<string[]>;
}): Promise<string[]> {
  const platformPath = options.platform === "win32" ? path.win32 : path.posix;
  if (options.platform === "win32") {
    return unique([
      options.executableDirectory,
      options.env.NVM_SYMLINK,
      options.env.ProgramFiles
        ? platformPath.join(options.env.ProgramFiles, "nodejs")
        : undefined,
      options.env.LOCALAPPDATA
        ? platformPath.join(options.env.LOCALAPPDATA, "Programs", "node")
        : undefined,
    ]);
  }

  const nvmRoot = platformPath.join(
    options.homeDirectory,
    ".nvm",
    "versions",
    "node",
  );
  let nvmVersions: string[] = [];
  try {
    nvmVersions = await options.readDirectory(nvmRoot);
  } catch {
    // NVM is optional.
  }
  nvmVersions.sort((left, right) =>
    right.localeCompare(left, undefined, {
      numeric: true,
      sensitivity: "base",
    }),
  );

  return unique([
    options.executableDirectory,
    ...nvmVersions.map((version) => platformPath.join(nvmRoot, version, "bin")),
    platformPath.join(options.homeDirectory, ".volta", "bin"),
    platformPath.join(
      options.homeDirectory,
      ".local",
      "share",
      "fnm",
      "current",
      "bin",
    ),
    "/opt/homebrew/bin",
    "/usr/local/bin",
  ]);
}

async function containsExecutable(
  directories: string[],
  executable: string,
  checkAccess: (candidate: string) => Promise<void>,
  platformPath: typeof path.posix | typeof path.win32,
): Promise<boolean> {
  for (const directory of directories) {
    if (
      await isAccessible(platformPath.join(directory, executable), checkAccess)
    )
      return true;
  }
  return false;
}

async function isAccessible(
  candidate: string,
  checkAccess: (candidate: string) => Promise<void>,
): Promise<boolean> {
  try {
    await checkAccess(candidate);
    return true;
  } catch {
    return false;
  }
}

function unique(values: Array<string | undefined>): string[] {
  return [
    ...new Set(values.filter((value): value is string => Boolean(value))),
  ];
}
