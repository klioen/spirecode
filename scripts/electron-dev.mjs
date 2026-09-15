import { rm } from "node:fs/promises";
import { spawn } from "node:child_process";
import concurrently from "concurrently";

await run("pnpm", ["prepare:pi-extensions"]);
await run("pnpm", ["check:pi-extensions"]);
await rm("dist-electron", { recursive: true, force: true });

const { result } = concurrently(
  [
    { command: "pnpm dev:renderer", name: "renderer" },
    { command: "pnpm dev:main", name: "main" },
    {
      command: "pnpm dev:electron",
      name: "electron",
      env: { VITE_DEV_SERVER_URL: "http://127.0.0.1:1420" },
    },
  ],
  {
    killOthers: ["failure", "success"],
    prefixColors: ["cyan", "magenta", "yellow"],
  },
);

try {
  await result;
} catch {
  process.exitCode = 1;
}

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: "inherit" });
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      if (code === 0) resolve();
      else reject(new Error(`${command} exited with ${code ?? signal}`));
    });
  });
}
