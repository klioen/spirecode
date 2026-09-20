import { spawn } from "node:child_process";
import { access, lstat, readdir } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { listPackage } from "@electron/asar";

const [appDirectoryArgument, executableArgument] = process.argv.slice(2);
if (!appDirectoryArgument || !executableArgument) {
  throw new Error(
    "Usage: node scripts/smoke-packaged-app.mjs <app-directory> <executable>",
  );
}

const root = path.resolve(import.meta.dirname, "..");
const appDirectory = path.resolve(appDirectoryArgument);
const executable = path.resolve(executableArgument);
const resourcesDirectory = await findResourcesDirectory(appDirectory);
const resources = path.resolve(resourcesDirectory);
const asar = path.join(resources, "app.asar");
await Promise.all([access(executable), access(asar)]);

await run(process.execPath, [
  path.join(root, "scripts/check-legal-resources.mjs"),
  resources,
]);
const removedBundledResource = ["pi", "extensions"].join("-");
if (await pathExists(path.join(resources, removedBundledResource))) {
  throw new Error(
    `Packaged app must not include ${removedBundledResource} resources`,
  );
}

const listing = listPackage(asar);
for (const required of [
  "/dist/index.html",
  "/dist-electron/main.js",
  "/dist-electron/preload.cjs",
  "/node_modules/@earendil-works/pi-coding-agent/",
]) {
  if (!listing.some((entry) => entry.startsWith(required))) {
    throw new Error(`Packaged app is missing ${required}`);
  }
}
if (
  listing.some((entry) => entry.endsWith(".map") || entry.includes(".test."))
) {
  throw new Error("Source maps or tests were included in app.asar");
}

const unpacked = path.join(resources, "app.asar.unpacked");
const ptyBinary = await findFile(unpacked, "pty.node");
if (!ptyBinary)
  throw new Error("Packaged app is missing node-pty native binary");
const clipboardPackage = clipboardPackageForPlatform();
const clipboardBinary = await findFile(
  unpacked,
  `clipboard.${process.platform}-${process.arch}.node`,
);
if (!clipboardBinary) {
  throw new Error(`Packaged app is missing ${clipboardPackage} native binary`);
}

await run(
  executable,
  [
    "-e",
    `const { createRequire } = require("node:module");
const requireFromApp = createRequire(${JSON.stringify(`${asar}/package.json`)});
const pty = requireFromApp("node-pty");
const shell = process.platform === "win32" ? (process.env.COMSPEC || "cmd.exe") : "/bin/sh";
const args = process.platform === "win32" ? ["/d", "/s", "/c", "echo pty-ok"] : ["-c", "printf pty-ok"];
const terminal = pty.spawn(shell, args, { cols: 80, rows: 24, cwd: require("node:os").tmpdir(), env: process.env });
let output = "";
terminal.onData((data) => output += data);
terminal.onExit(() => process.exit(output.includes("pty-ok") ? 0 : 2));`,
  ],
  { ELECTRON_RUN_AS_NODE: "1" },
);
await run(
  executable,
  [
    "-e",
    `const { createRequire } = require("node:module");
const requireFromApp = createRequire(${JSON.stringify(`${asar}/package.json`)});
const clipboard = requireFromApp(${JSON.stringify(clipboardPackage)});
process.exit(clipboard ? 0 : 2);`,
  ],
  { ELECTRON_RUN_AS_NODE: "1" },
);
await run(
  executable,
  [
    "-e",
    `const entry = ${JSON.stringify(pathToFileURL(`${asar}/node_modules/@earendil-works/pi-coding-agent/dist/index.js`).href)};
import(entry).then(async (sdk) => {
  if (typeof sdk.createAgentSession !== "function") process.exit(2);
  const runtime = await sdk.ModelRuntime.create();
  process.exit(typeof runtime.getAvailable === "function" ? 0 : 2);
}).catch((error) => { console.error(error); process.exit(1); });`,
  ],
  { ELECTRON_RUN_AS_NODE: "1", PI_OFFLINE: "1" },
);

await launchGui(executable);
console.log(`Packaged app smoke passed: ${appDirectory}`);

function clipboardPackageForPlatform() {
  if (process.platform === "darwin" && process.arch === "arm64") {
    return "@mariozechner/clipboard-darwin-arm64";
  }
  if (process.platform === "win32" && process.arch === "x64") {
    return "@mariozechner/clipboard-win32-x64-msvc";
  }
  if (process.platform === "linux" && process.arch === "x64") {
    return "@mariozechner/clipboard-linux-x64-gnu";
  }
  throw new Error(
    `Unsupported clipboard smoke platform: ${process.platform}-${process.arch}`,
  );
}

async function pathExists(candidate) {
  try {
    await lstat(candidate);
    return true;
  } catch (error) {
    if (error?.code === "ENOENT") return false;
    throw error;
  }
}

async function findResourcesDirectory(directory) {
  for (const candidate of ["resources", "Resources"]) {
    const resources = path.join(directory, candidate);
    try {
      await access(path.join(resources, "app.asar"));
      return resources;
    } catch {
      // Try the next platform-specific casing.
    }
  }
  throw new Error(`Packaged app resources not found in ${directory}`);
}

async function findFile(directory, basename) {
  let entries;
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch {
    return undefined;
  }
  for (const entry of entries) {
    const candidate = path.join(directory, entry.name);
    if (entry.isFile() && entry.name === basename) return candidate;
    if (entry.isDirectory()) {
      const nested = await findFile(candidate, basename);
      if (nested) return nested;
    }
  }
  return undefined;
}

function run(command, args, additionalEnv = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: "inherit",
      env: { ...process.env, ...additionalEnv },
      windowsHide: true,
    });
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      if (code === 0) resolve();
      else reject(new Error(`${command} exited with ${code ?? signal}`));
    });
  });
}

async function launchGui(command) {
  const userData = path.join(
    process.env.RUNNER_TEMP || process.env.TMPDIR || process.env.TEMP || ".",
    `spirecode-smoke-${process.pid}`,
  );
  const child = spawn(command, [`--user-data-dir=${userData}`], {
    stdio: "inherit",
    env: { ...process.env, PI_OFFLINE: "1" },
    windowsHide: true,
  });
  let exitCode;
  const exited = new Promise((resolve) => {
    child.once("exit", (code, signal) => {
      exitCode = code ?? signal;
      resolve();
    });
  });
  const earlyExit = await Promise.race([
    exited.then(() => true),
    delay(5_000).then(() => false),
  ]);
  if (earlyExit) throw new Error(`GUI exited during smoke with ${exitCode}`);

  child.kill();
  if (await exitedWithin(exited, 3_000)) return;

  if (process.platform === "win32") {
    await run("taskkill.exe", ["/pid", String(child.pid), "/t", "/f"]);
  } else {
    child.kill("SIGKILL");
  }
  if (!(await exitedWithin(exited, 5_000))) {
    throw new Error("GUI process did not exit after forced termination");
  }
}

function exitedWithin(exited, milliseconds) {
  return Promise.race([
    exited.then(() => true),
    delay(milliseconds).then(() => false),
  ]);
}

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}
