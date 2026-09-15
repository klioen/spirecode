import { rm } from "node:fs/promises";
import { spawn } from "node:child_process";

function run(command, args, env = process.env) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: "inherit", env });
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      if (code === 0) resolve();
      else reject(new Error(`${command} exited with ${code ?? signal}`));
    });
  });
}

await rm("release", { recursive: true, force: true });
await run("pnpm", ["prepare:pi-extensions"]);
await run("pnpm", ["check:pi-extensions"]);
await run("pnpm", ["build"]);
await run("pnpm", ["exec", "electron-builder", "--mac", "--arm64", "--dir"], {
  ...process.env,
  CSC_IDENTITY_AUTO_DISCOVERY: "false",
});
await run("node", [
  "scripts/check-pi-extensions.mjs",
  "release/mac-arm64/SpireCode.app/Contents/Resources/pi-extensions",
]);
await run("./scripts/sign-electron-app.sh", []);
await run("pnpm", [
  "exec",
  "electron-builder",
  "--prepackaged",
  "release/mac-arm64/SpireCode.app",
  "--mac",
  "dmg",
  "--arm64",
]);
await run("./scripts/smoke-app.sh", []);
await run("./scripts/smoke-dmg.sh", []);
