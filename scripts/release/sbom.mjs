import { execFileSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";

const output = process.argv[2] ?? "release/sbom.cdx.json";
const pkg = JSON.parse(await readFile("package.json", "utf8"));
const lock = await readFile("pnpm-lock.yaml", "utf8");
const list = JSON.parse(
  execFileSync("pnpm", ["list", "--prod", "--depth", "Infinity", "--json"], {
    encoding: "utf8",
    maxBuffer: 100 * 1024 * 1024,
  }),
);
const root = list[0];
const components = new Map();
const dependencies = new Map();

function ref(name, version) {
  const packagePath = name.startsWith("@")
    ? `${encodeURIComponent(name.slice(1).split("/")[0])}/${encodeURIComponent(name.split("/").slice(1).join("/"))}`
    : encodeURIComponent(name);
  return `pkg:npm/${packagePath}@${encodeURIComponent(version)}`;
}

function visit(node) {
  const name = node.name ?? node.from;
  const version = node.version;
  if (!name || !version) return null;
  const bomRef = ref(name, version);
  if (!components.has(bomRef)) {
    components.set(bomRef, { type: "library", "bom-ref": bomRef, name, version, purl: bomRef });
  }
  const children = Object.values({
    ...(node.dependencies ?? {}),
    ...(node.optionalDependencies ?? {}),
  })
    .map(visit)
    .filter(Boolean)
    .sort();
  dependencies.set(bomRef, { ref: bomRef, dependsOn: [...new Set(children)] });
  return bomRef;
}

const direct = Object.values({
  ...(root.dependencies ?? {}),
  ...(root.optionalDependencies ?? {}),
})
  .map(visit)
  .filter(Boolean)
  .sort();

const electronVersion = pkg.devDependencies?.electron;
const electronRef = electronVersion ? ref("electron", electronVersion) : null;
if (electronRef) {
  components.set(electronRef, {
    type: "framework",
    "bom-ref": electronRef,
    name: "electron",
    version: electronVersion,
    purl: electronRef,
    properties: [
      { name: "spirecode:distribution-role", value: "desktop-runtime" },
    ],
  });
  dependencies.set(electronRef, { ref: electronRef, dependsOn: [] });
}

const rootRef = ref(pkg.name, pkg.version);
const lockHash = createHash("sha256").update(lock).digest("hex");
const sbom = {
  bomFormat: "CycloneDX",
  specVersion: "1.5",
  serialNumber: `urn:uuid:${randomUUID()}`,
  version: 1,
  metadata: {
    timestamp: new Date().toISOString(),
    tools: [{ vendor: "SpireCode", name: "scripts/release/sbom.mjs", version: "1" }],
    component: {
      type: "application",
      "bom-ref": rootRef,
      name: pkg.name,
      version: pkg.version,
    },
    properties: [
      { name: "spirecode:package-manager", value: pkg.packageManager },
      { name: "spirecode:pnpm-lock-sha256", value: lockHash },
    ],
  },
  components: [...components.values()].sort((a, b) =>
    a["bom-ref"].localeCompare(b["bom-ref"]),
  ),
  dependencies: [
    {
      ref: rootRef,
      dependsOn: [
        ...new Set([...direct, ...(electronRef ? [electronRef] : [])]),
      ],
    },
    ...[...dependencies.values()].sort((a, b) => a.ref.localeCompare(b.ref)),
  ],
};
await writeFile(output, `${JSON.stringify(sbom, null, 2)}\n`);
console.log(`Wrote ${output} with ${components.size} production component(s)`);
