import { spawn } from "node:child_process";
import { access, rm } from "node:fs/promises";
import path from "node:path";
import { stageClipboardPackage } from "./package-helpers.mjs";

const packageManagerCli = process.env.npm_execpath;

function run(command, args, env = process.env) {
  const executable =
    command === "pnpm" && packageManagerCli ? process.execPath : command;
  const executableArgs =
    command === "pnpm" && packageManagerCli
      ? [packageManagerCli, ...args]
      : args;
  return new Promise((resolve, reject) => {
    const child = spawn(executable, executableArgs, {
      stdio: "inherit",
      env,
      windowsHide: true,
    });
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      if (code === 0) resolve();
      else reject(new Error(`${command} exited with ${code ?? signal}`));
    });
  });
}

const pnpm = "pnpm";
const buildEnv = { ...process.env, CSC_IDENTITY_AUTO_DISCOVERY: "false" };
const root = process.cwd();

await rm("release", { recursive: true, force: true });
await run(pnpm, ["prepare:pi-extensions"]);
await run(pnpm, ["check:pi-extensions"]);
await run(pnpm, ["build"]);
const stagedClipboard = await stageClipboardPackage(
  root,
  process.platform,
  process.arch,
);
console.log(`Staged ${stagedClipboard.packageName} for packaging`);
try {
  if (process.platform === "darwin") {
    await packageMac();
  } else if (process.platform === "win32") {
    await packageWindows();
  } else if (process.platform === "linux") {
    await packageLinux();
  } else {
    throw new Error(`Unsupported packaging platform: ${process.platform}`);
  }
} finally {
  await stagedClipboard.cleanup();
}

async function packageMac() {
  await run(
    pnpm,
    [
      "exec",
      "electron-builder",
      "--mac",
      "--arm64",
      "--dir",
      "--publish",
      "never",
    ],
    buildEnv,
  );
  await run(process.execPath, [
    "scripts/check-pi-extensions.mjs",
    "release/mac-arm64/SpireCode.app/Contents/Resources/pi-extensions",
  ]);
  await run("./scripts/sign-electron-app.sh", []);
  await run(
    pnpm,
    [
      "exec",
      "electron-builder",
      "--prepackaged",
      "release/mac-arm64/SpireCode.app",
      "--mac",
      "dmg",
      "--arm64",
      "--publish",
      "never",
    ],
    buildEnv,
  );
  await run("./scripts/smoke-app.sh", []);
  await run("./scripts/smoke-dmg.sh", []);
}

async function packageWindows() {
  const appDirectory = "release/win-unpacked";
  const executable = path.join(appDirectory, "SpireCode.exe");
  await run(
    pnpm,
    [
      "exec",
      "electron-builder",
      "--win",
      "--x64",
      "--dir",
      "--publish",
      "never",
    ],
    buildEnv,
  );
  await access(executable);
  await run(process.execPath, [
    "scripts/smoke-packaged-app.mjs",
    appDirectory,
    executable,
  ]);
  await run(
    pnpm,
    [
      "exec",
      "electron-builder",
      "--prepackaged",
      appDirectory,
      "--win",
      "nsis",
      "--x64",
      "--publish",
      "never",
    ],
    buildEnv,
  );
}

async function packageLinux() {
  const appDirectory = "release/linux-unpacked";
  const executable = path.join(appDirectory, "spirecode");
  await run(
    pnpm,
    [
      "exec",
      "electron-builder",
      "--linux",
      "--x64",
      "--dir",
      "--publish",
      "never",
    ],
    buildEnv,
  );
  await access(executable);
  const smokeCommand = process.env.CI ? "xvfb-run" : process.execPath;
  const smokeArgs = process.env.CI
    ? [
        "--auto-servernum",
        process.execPath,
        "scripts/smoke-packaged-app.mjs",
        appDirectory,
        executable,
      ]
    : ["scripts/smoke-packaged-app.mjs", appDirectory, executable];
  await run(smokeCommand, smokeArgs);
  await run(
    pnpm,
    [
      "exec",
      "electron-builder",
      "--prepackaged",
      appDirectory,
      "--linux",
      "AppImage",
      "deb",
      "--x64",
      "--publish",
      "never",
    ],
    buildEnv,
  );
}
