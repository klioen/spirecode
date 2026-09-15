import { createHash } from "node:crypto";
import { lstat, readFile, readdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import {
  BUNDLED_PACKAGES,
  PI_EXTENSIONS_COMMIT,
  REQUIRED_FILES,
} from "./pi-extensions-config.mjs";

const root = resolve(process.argv[2] ?? ".build/pi-extensions");
const manifest = JSON.parse(
  await readFile(join(root, "bundle-manifest.json"), "utf8"),
);
if (manifest.sourceCommit !== PI_EXTENSIONS_COMMIT) {
  throw new Error(
    `Unexpected Pi extensions commit: ${String(manifest.sourceCommit)}`,
  );
}

const expectedNames = BUNDLED_PACKAGES.map(([, name]) => name).sort();
const actualEntries = (await readdir(root))
  .filter((name) => name !== "bundle-manifest.json")
  .sort();
if (JSON.stringify(actualEntries) !== JSON.stringify(expectedNames)) {
  throw new Error(
    `Unexpected bundled package set: ${actualEntries.join(", ")}`,
  );
}

for (const expectedName of expectedNames) {
  const packageManifest = JSON.parse(
    await readFile(join(root, expectedName, "package.json"), "utf8"),
  );
  if (packageManifest.name !== expectedName) {
    throw new Error(
      `Expected ${expectedName}, found ${String(packageManifest.name)}`,
    );
  }
}
for (const required of REQUIRED_FILES)
  await assertRegularFile(join(root, required));
for (const [relativePath, expectedHash] of Object.entries(
  manifest.files ?? {},
)) {
  const path = join(root, relativePath);
  await assertRegularFile(path);
  const hash = createHash("sha256")
    .update(await readFile(path))
    .digest("hex");
  if (hash !== expectedHash) throw new Error(`Hash mismatch: ${relativePath}`);
}
console.log(`Verified ${expectedNames.length} bundled Pi packages in ${root}`);

async function assertRegularFile(path) {
  const stat = await lstat(path);
  if (!stat.isFile() || stat.isSymbolicLink())
    throw new Error(`Expected a regular file: ${path}`);
}
