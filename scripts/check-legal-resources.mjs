import { createHash } from "node:crypto";
import { access, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const required = [
  "LICENSE",
  "TRADEMARKS.md",
  "PRIVACY.md",
  "THIRD_PARTY_NOTICES.md",
];

export async function checkLegalResources(resourcesDirectory) {
  const legalDirectory = path.join(resourcesDirectory, "legal");
  for (const filename of required) {
    const source = path.join(root, filename);
    const packaged = path.join(legalDirectory, filename);
    await access(packaged);
    const [sourceBytes, packagedBytes] = await Promise.all([
      readFile(source),
      readFile(packaged),
    ]);
    if (digest(sourceBytes) !== digest(packagedBytes)) {
      throw new Error(
        `Packaged legal document does not match source: ${filename}`,
      );
    }
  }
  return required;
}

function digest(value) {
  return createHash("sha256").update(value).digest("hex");
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const directory = process.argv[2];
  if (!directory)
    throw new Error(
      "Usage: node scripts/check-legal-resources.mjs <resources-directory>",
    );
  await checkLegalResources(path.resolve(directory));
  console.log(`Verified packaged legal resources: ${directory}`);
}
