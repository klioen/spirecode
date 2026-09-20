import { cp, mkdir, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const destination = path.join(root, ".build", "legal");
const legalFiles = [
  "LICENSE",
  "TRADEMARKS.md",
  "PRIVACY.md",
  "THIRD_PARTY_NOTICES.md",
];

export async function prepareLegalResources(output = destination) {
  await rm(output, { recursive: true, force: true });
  await mkdir(output, { recursive: true });
  for (const filename of legalFiles) {
    await cp(path.join(root, filename), path.join(output, filename), {
      errorOnExist: true,
    });
  }
  return legalFiles;
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  await prepareLegalResources();
  console.log(
    `Prepared ${legalFiles.length} legal documents in ${destination}`,
  );
}
