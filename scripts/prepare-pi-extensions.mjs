import { createHash } from "node:crypto";
import {
  cp,
  lstat,
  mkdir,
  readFile,
  readdir,
  rm,
  writeFile,
} from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  ALLOWED_PACKAGE_ENTRIES,
  BUNDLED_PACKAGES,
  PI_EXTENSIONS_COMMIT,
  REQUIRED_FILES,
} from "./pi-extensions-config.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const output = join(root, ".build", "pi-extensions");
const require = createRequire(import.meta.url);
const sourceRoot = dirname(require.resolve("pi-extensions/package.json"));

await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });

const packages = [];
for (const [sourceName, expectedName] of BUNDLED_PACKAGES) {
  const source = join(sourceRoot, "packages", sourceName);
  const manifest = JSON.parse(
    await readFile(join(source, "package.json"), "utf8"),
  );
  if (manifest.name !== expectedName) {
    throw new Error(
      `Expected ${expectedName}, found ${String(manifest.name)} in ${source}`,
    );
  }
  if (Object.keys(manifest.dependencies ?? {}).length > 0) {
    throw new Error(
      `${expectedName} has runtime dependencies; update the bundle design before packaging it`,
    );
  }
  const destination = join(output, expectedName);
  await mkdir(destination, { recursive: true });
  for (const entry of ALLOWED_PACKAGE_ENTRIES) {
    const sourceEntry = join(source, entry);
    try {
      const stat = await lstat(sourceEntry);
      if (stat.isSymbolicLink())
        throw new Error(`Refusing symlink: ${sourceEntry}`);
      await cp(sourceEntry, join(destination, entry), {
        recursive: true,
        errorOnExist: true,
      });
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
    }
  }
  packages.push({ name: expectedName, version: manifest.version });
}

const files = {};
for (const file of await listFiles(output)) {
  files[relative(output, file)] = createHash("sha256")
    .update(await readFile(file))
    .digest("hex");
}
for (const required of REQUIRED_FILES) {
  if (!files[required])
    throw new Error(`Bundled Pi resource is missing: ${required}`);
}
await writeFile(
  join(output, "bundle-manifest.json"),
  `${JSON.stringify({ sourceCommit: PI_EXTENSIONS_COMMIT, packages, files }, null, 2)}\n`,
);
console.log(`Prepared ${packages.length} Pi packages in ${output}`);

async function listFiles(directory) {
  const result = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isSymbolicLink()) throw new Error(`Refusing symlink: ${path}`);
    if (entry.isDirectory()) result.push(...(await listFiles(path)));
    else if (entry.isFile()) result.push(path);
  }
  return result.sort();
}
