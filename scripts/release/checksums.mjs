import { createHash } from "node:crypto";
import { readdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";

const root = process.argv[2] ?? "release";
const output = process.argv[3] ?? path.join(root, "SHA256SUMS.txt");
const extensions = new Set([".dmg", ".exe", ".AppImage", ".deb"]);

const files = (await readdir(root, { withFileTypes: true }))
  .filter((entry) => entry.isFile() && extensions.has(path.extname(entry.name)))
  .map((entry) => entry.name)
  .sort();
if (files.length === 0) throw new Error(`No release artifacts found in ${root}`);

const lines = [];
for (const name of files) {
  const file = path.join(root, name);
  if (!(await stat(file)).isFile()) continue;
  const digest = createHash("sha256").update(await readFile(file)).digest("hex");
  lines.push(`${digest}  ${name}`);
}
await writeFile(output, `${lines.join("\n")}\n`);
console.log(`Wrote ${output} for ${lines.length} artifact(s)`);
