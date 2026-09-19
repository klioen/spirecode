import {
  cp,
  lstat,
  mkdir,
  readdir,
  realpath,
  rename,
  rm,
} from "node:fs/promises";
import path from "node:path";

export function portableRelativePath(value) {
  return value.replaceAll("\\", "/");
}

export function clipboardPackageForTarget(platform, arch) {
  if (platform === "darwin" && arch === "arm64")
    return "@mariozechner/clipboard-darwin-arm64";
  if (platform === "win32" && arch === "x64")
    return "@mariozechner/clipboard-win32-x64-msvc";
  if (platform === "linux" && arch === "x64")
    return "@mariozechner/clipboard-linux-x64-gnu";
  throw new Error(`Unsupported clipboard package target: ${platform}-${arch}`);
}

export async function copyDirectoryWithoutSymlinks(source, destination) {
  await assertTreeHasNoSymlinks(source);
  await mkdir(path.dirname(destination), { recursive: true });
  await cp(source, destination, { recursive: true, errorOnExist: true });
}

export async function stageClipboardPackage(root, platform, arch) {
  const packageName = clipboardPackageForTarget(platform, arch);
  const packageSuffix = packageName.slice("@mariozechner/".length);
  const virtualStore = await realpath(path.join(root, "node_modules", ".pnpm"));
  const virtualLink = path.join(
    virtualStore,
    "node_modules",
    "@mariozechner",
    packageSuffix,
  );
  let source;
  try {
    source = await realpath(virtualLink);
  } catch {
    throw new Error(
      `Installed clipboard package is missing for ${platform}-${arch}: ${packageName}`,
    );
  }
  assertContained(virtualStore, source);

  const destination = path.join(
    root,
    "node_modules",
    ...packageName.split("/"),
  );
  const backup = `${destination}.spirecode-backup`;
  let movedExisting = false;
  let stagedIdentity;
  try {
    const staleBackup = await lstat(backup).catch((error) => {
      if (error?.code === "ENOENT") return null;
      throw error;
    });
    if (staleBackup) {
      const staleDestination = await lstat(destination).catch((error) => {
        if (error?.code === "ENOENT") return null;
        throw error;
      });
      if (staleDestination)
        await rm(destination, { recursive: true, force: true });
      await rename(backup, destination);
    }
    const existing = await lstat(destination).catch((error) => {
      if (error?.code === "ENOENT") return null;
      throw error;
    });
    if (existing) {
      await rename(destination, backup);
      movedExisting = true;
    }
    await copyDirectoryWithoutSymlinks(source, destination);
    const staged = await lstat(destination);
    stagedIdentity = { dev: staged.dev, ino: staged.ino };
  } catch (error) {
    await rm(destination, { recursive: true, force: true });
    if (movedExisting) await rename(backup, destination);
    throw error;
  }

  let cleaned = false;
  return {
    packageName,
    destination,
    cleanup: async () => {
      if (cleaned) return;
      const current = await lstat(destination).catch((error) => {
        if (error?.code === "ENOENT") return null;
        throw error;
      });
      if (
        current &&
        (current.dev !== stagedIdentity.dev ||
          current.ino !== stagedIdentity.ino)
      ) {
        throw new Error(
          `Refusing to remove replaced staged package: ${destination}`,
        );
      }
      await rm(destination, { recursive: true, force: true });
      if (movedExisting) await rename(backup, destination);
      cleaned = true;
    },
  };
}

async function assertTreeHasNoSymlinks(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const candidate = path.join(directory, entry.name);
    if (entry.isSymbolicLink())
      throw new Error(`Refusing symlink: ${candidate}`);
    if (entry.isDirectory()) await assertTreeHasNoSymlinks(candidate);
  }
}

function assertContained(root, candidate) {
  const relativePath = path.relative(root, candidate);
  if (
    relativePath === ".." ||
    relativePath.startsWith(`..${path.sep}`) ||
    path.isAbsolute(relativePath)
  ) {
    throw new Error(
      `Clipboard package escaped pnpm virtual store: ${candidate}`,
    );
  }
}
