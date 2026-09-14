import { rm } from "node:fs/promises";
import concurrently from "concurrently";

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
