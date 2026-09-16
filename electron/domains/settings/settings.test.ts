// @vitest-environment node
import {
  mkdtemp,
  mkdir,
  readFile,
  realpath,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { SettingsService } from "./index.js";

async function fixture() {
  const root = await mkdtemp(path.join(tmpdir(), "spire-settings-"));
  const cwd = path.join(root, "project");
  const agentDir = path.join(root, "agent");
  const statePath = path.join(root, "state", "extensions.json");
  await Promise.all([
    mkdir(path.join(cwd, ".spirecode", "extensions"), { recursive: true }),
    mkdir(path.join(cwd, ".pi", "extensions"), { recursive: true }),
    mkdir(path.join(agentDir, "extensions"), { recursive: true }),
    mkdir(path.join(root, "package", "extensions"), { recursive: true }),
  ]);
  await Promise.all([
    writeFile(
      path.join(cwd, ".spirecode", "extensions", "review.ts"),
      "export default () => {}",
    ),
    writeFile(
      path.join(cwd, ".pi", "extensions", "project.ts"),
      "export default () => {}",
    ),
    writeFile(
      path.join(agentDir, "extensions", "global.ts"),
      "export default () => {}",
    ),
    writeFile(
      path.join(root, "package", "extensions", "one.ts"),
      "export default () => {}",
    ),
    writeFile(
      path.join(root, "package", "extensions", "two.ts"),
      "export default () => {}",
    ),
    writeFile(
      path.join(root, "package", "package.json"),
      JSON.stringify({
        name: "fixture-package",
        version: "1.0.0",
        pi: { extensions: ["./extensions"] },
      }),
    ),
    writeFile(
      path.join(agentDir, "settings.json"),
      JSON.stringify({ packages: ["../package"] }),
    ),
  ]);
  return { root, cwd, agentDir, statePath };
}

describe("SettingsService", () => {
  it("discovers SpireCode and Pi extensions with scope metadata", async () => {
    const { cwd, agentDir, statePath } = await fixture();
    const service = await SettingsService.load(statePath, agentDir);

    const catalog = await service.list(cwd);

    expect(catalog).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: "review",
          source: "spirecode",
          scope: "project",
          enabled: true,
        }),
        expect.objectContaining({
          name: "project",
          source: "pi",
          scope: "project",
          enabled: true,
        }),
        expect.objectContaining({
          name: "global",
          source: "pi",
          scope: "global",
          enabled: true,
        }),
      ]),
    );
  });

  it("persists overrides and rejects unknown extension ids", async () => {
    const { cwd, agentDir, statePath } = await fixture();
    const service = await SettingsService.load(statePath, agentDir);
    const extension = (await service.list(cwd)).find(
      ({ name }) => name === "review",
    )!;

    const updated = await service.setEnabled(cwd, extension.id, false);
    expect(updated.find(({ id }) => id === extension.id)?.enabled).toBe(false);
    expect(JSON.parse(await readFile(statePath, "utf8"))).toMatchObject({
      version: 1,
      overrides: { [extension.id]: false },
    });

    const reloaded = await SettingsService.load(statePath, agentDir);
    expect(
      (await reloaded.list(cwd)).find(({ id }) => id === extension.id)?.enabled,
    ).toBe(false);
    await expect(service.setEnabled(cwd, "unknown", true)).rejects.toThrow(
      "extension not found",
    );
  });

  it("loads standalone Pi extensions without reintroducing replaced packages", async () => {
    const { root, cwd, agentDir, statePath } = await fixture();
    const service = await SettingsService.load(statePath, agentDir);
    const omittedPackage = await realpath(path.join(root, "package"));
    const bundled = path.join(root, "bundled", "fixture-package");
    await mkdir(bundled, { recursive: true });
    await writeFile(
      path.join(bundled, "package.json"),
      JSON.stringify({ name: "fixture-package", version: "1.0.0" }),
    );

    const selected = await service.enabledPaths(cwd, [bundled]);
    const canonical = await Promise.all(
      selected.map((entry) => realpath(entry)),
    );

    expect(canonical).toContain(await realpath(bundled));
    expect(canonical).toContain(
      await realpath(path.join(cwd, ".spirecode", "extensions", "review.ts")),
    );
    expect(canonical).toContain(
      await realpath(path.join(cwd, ".pi", "extensions", "project.ts")),
    );
    expect(canonical).toContain(
      await realpath(path.join(agentDir, "extensions", "global.ts")),
    );
    expect(canonical).not.toContain(omittedPackage);
  });

  it("toggles standalone Pi extensions independently", async () => {
    const { cwd, agentDir, statePath } = await fixture();
    await writeFile(
      path.join(agentDir, "extensions", "second.ts"),
      "export default () => {}",
    );
    const service = await SettingsService.load(statePath, agentDir);
    const global = (await service.list(cwd)).find(
      ({ name, source }) => name === "global" && source === "pi",
    )!;

    const updated = await service.setEnabled(cwd, global.id, false);

    expect(updated.find(({ id }) => id === global.id)?.enabled).toBe(false);
    expect(updated.find(({ name }) => name === "second")?.enabled).toBe(true);
  });

  it("disables every extension entry belonging to one package load root", async () => {
    const { root, cwd, agentDir, statePath } = await fixture();
    const service = await SettingsService.load(statePath, agentDir);
    const packageRoot = await realpath(path.join(root, "package"));
    const packageEntry = (await service.list(cwd)).find(
      ({ source }) => source === "package",
    )!;

    await service.setEnabled(cwd, packageEntry.id, false);

    expect(
      (await service.list(cwd))
        .filter(({ source }) => source === "package")
        .every(({ enabled }) => !enabled),
    ).toBe(true);
    expect(await service.enabledPaths(cwd, [packageRoot])).not.toContain(
      packageRoot,
    );
  });

  it("preserves unresolved remote package sources for the Pi loader", async () => {
    const { cwd, agentDir, statePath } = await fixture();
    const service = await SettingsService.load(statePath, agentDir);

    await expect(
      service.enabledPaths(cwd, ["npm:example-extension"]),
    ).resolves.toContain("npm:example-extension");
  });

  it("canonicalizes symlink load roots before applying disabled state", async () => {
    const { root, cwd, agentDir, statePath } = await fixture();
    const service = await SettingsService.load(statePath, agentDir);
    const global = (await service.list(cwd)).find(
      ({ name, source }) => name === "global" && source === "pi",
    )!;
    await service.setEnabled(cwd, global.id, false);
    const alias = path.join(root, "global-alias.ts");
    await symlink(path.join(agentDir, "extensions", "global.ts"), alias);

    expect(await service.enabledPaths(cwd, [alias])).not.toContain(
      await realpath(alias),
    );
  });

  it("does not expose project extension symlinks that escape the worktree", async () => {
    const { root, cwd, agentDir, statePath } = await fixture();
    const outside = path.join(root, "outside.ts");
    await writeFile(outside, "export default () => {}");
    await Promise.all([
      symlink(
        outside,
        path.join(cwd, ".spirecode", "extensions", "outside.ts"),
      ),
      symlink(outside, path.join(cwd, ".pi", "extensions", "escaped.ts")),
    ]);
    const service = await SettingsService.load(statePath, agentDir);
    const names = (await service.list(cwd)).map(({ name }) => name);

    expect(names).not.toContain("outside");
    expect(names).not.toContain("escaped");
  });
});
