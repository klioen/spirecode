import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  DefaultResourceLoader,
  SettingsManager,
} from "@earendil-works/pi-coding-agent";
import { describe, expect, it } from "vitest";

async function extension(directory: string, name: string) {
  await mkdir(directory, { recursive: true });
  const file = path.join(directory, `${name}.ts`);
  await writeFile(
    file,
    `export default function (pi) { pi.registerCommand(${JSON.stringify(name)}, { handler() {} }); }\n`,
  );
  return file;
}

describe("SpireCode resource isolation", () => {
  it("ignores Pi global and project extensions while loading explicit resources", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "spire-isolation-"));
    const agentDir = path.join(root, ".pi", "agent");
    const cwd = path.join(root, "project");
    const globalExtension = await extension(
      path.join(agentDir, "extensions"),
      "pi_global_probe",
    );
    await mkdir(agentDir, { recursive: true });
    await writeFile(
      path.join(agentDir, "settings.json"),
      JSON.stringify({ extensions: [globalExtension] }),
    );
    await extension(path.join(cwd, ".pi", "extensions"), "project_probe");
    const explicit = await extension(
      path.join(root, ".spirecode", "extensions"),
      "spire_probe",
    );

    const loader = new DefaultResourceLoader({
      cwd,
      agentDir,
      settingsManager: SettingsManager.inMemory({}, { projectTrusted: true }),
      noExtensions: true,
      additionalExtensionPaths: [explicit],
    });
    await loader.reload();

    const commands = loader
      .getExtensions()
      .extensions.flatMap((entry) => [...entry.commands.keys()]);
    expect(commands).toEqual(["spire_probe"]);
  });
});
