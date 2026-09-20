import { execFileSync } from "node:child_process";

const allowed = new Set([
  "0BSD",
  "Apache-2.0",
  "BSD-3-Clause",
  "BlueOak-1.0.0",
  "ISC",
  "MIT",
  "MPL-2.0 OR Apache-2.0",
  "Remix Icon License 1.0",
]);
const report = JSON.parse(
  execFileSync("pnpm", ["licenses", "list", "--prod", "--json"], {
    encoding: "utf8",
    maxBuffer: 100 * 1024 * 1024,
  }),
);
const rejected = Object.keys(report).filter((license) => {
  const normalized =
    license.startsWith("(") && license.endsWith(")")
      ? license.slice(1, -1)
      : license;
  return !allowed.has(normalized);
});
if (rejected.length > 0)
  throw new Error(
    `Unapproved production license metadata: ${rejected.join(", ")}`,
  );
console.log(
  `Production license metadata check passed for ${Object.keys(report).length} license expression(s)`,
);
