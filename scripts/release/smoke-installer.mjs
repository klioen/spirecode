import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, readdirSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    stdio: "inherit",
    windowsHide: true,
    ...options,
  });
  if (result.error) throw result.error;
  if (result.status !== 0)
    throw new Error(`${command} exited with ${result.status ?? result.signal}`);
}

function exactlyOne(extension) {
  const matches = readdirSync("release")
    .filter((name) => name.endsWith(extension))
    .map((name) => path.resolve("release", name));
  if (matches.length !== 1)
    throw new Error(`Expected exactly one ${extension} artifact, found ${matches.length}`);
  return matches[0];
}

export function smokeWindowsInstaller() {
  const installer = exactlyOne(".exe");
  const temporary = mkdtempSync(path.join(os.tmpdir(), "spirecode-install-"));
  const installDirectory = path.join(temporary, "app");
  try {
    run(installer, ["/S", `/D=${installDirectory}`]);
    const executable = path.join(installDirectory, "SpireCode.exe");
    run(process.execPath, [
      "scripts/smoke-packaged-app.mjs",
      installDirectory,
      executable,
    ]);
    const uninstaller = path.join(installDirectory, "Uninstall SpireCode.exe");
    run(uninstaller, ["/S"]);
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
}

export function smokeLinuxInstallers() {
  const appImage = exactlyOne(".AppImage");
  const deb = exactlyOne(".deb");
  const temporary = mkdtempSync(path.join(os.tmpdir(), "spirecode-install-"));
  try {
    run(appImage, ["--appimage-extract"], { cwd: temporary });
    const extractedRoot = path.join(temporary, "squashfs-root");
    const resources = findResources(extractedRoot);
    const appDirectory = path.dirname(resources);
    const executable = findExecutable(appDirectory, "spirecode");
    run("xvfb-run", [
      "--auto-servernum",
      process.execPath,
      path.resolve("scripts/smoke-packaged-app.mjs"),
      appDirectory,
      executable,
    ]);

    run("sudo", ["apt-get", "install", "-y", deb]);
    try {
      const installedFiles = execFileSync(
        "dpkg-query",
        ["-L", "spirecode"],
        { encoding: "utf8" },
      )
        .split(/\r?\n/u)
        .filter(Boolean);
      const installedAsar = installedFiles.find((file) =>
        file.endsWith("/resources/app.asar"),
      );
      if (!installedAsar)
        throw new Error("Installed deb is missing resources/app.asar");
      const installedResources = path.dirname(installedAsar);
      const installedAppDirectory = path.dirname(installedResources);
      const installedExecutable = installedFiles.find(
        (file) => path.basename(file) === "spirecode",
      );
      if (!installedExecutable)
        throw new Error("Installed deb is missing the SpireCode executable");
      run("xvfb-run", [
        "--auto-servernum",
        process.execPath,
        path.resolve("scripts/smoke-packaged-app.mjs"),
        installedAppDirectory,
        installedExecutable,
      ]);
    } finally {
      run("sudo", ["apt-get", "remove", "-y", "spirecode"]);
    }
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
}

function findExecutable(root, basename) {
  const pending = [root];
  while (pending.length > 0) {
    const directory = pending.pop();
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const candidate = path.join(directory, entry.name);
      if (entry.isDirectory()) pending.push(candidate);
      else if (entry.isFile() && entry.name === basename) return candidate;
    }
  }
  throw new Error(`Executable ${basename} not found under ${root}`);
}

function findResources(root) {
  const pending = [root];
  while (pending.length > 0) {
    const directory = pending.pop();
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const candidate = path.join(directory, entry.name);
      if (entry.isDirectory()) pending.push(candidate);
      else if (entry.isFile() && entry.name === "app.asar") return directory;
    }
  }
  throw new Error(`Packaged resources not found under ${root}`);
}

if (process.platform === "win32") smokeWindowsInstaller();
else if (process.platform === "linux") smokeLinuxInstallers();
else throw new Error("Installer smoke is only supported on Windows and Linux");
