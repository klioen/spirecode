// @vitest-environment node
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";

const checker = path.resolve("scripts/check-localized-copy.mjs");

describe("localized copy guard", () => {
  it("accepts translated JSX and rejects literal and expression copy", async () => {
    const directory = await mkdtemp(path.join(tmpdir(), "spire-i18n-guard-"));
    const translated = path.join(directory, "translated.tsx");
    const hardCoded = path.join(directory, "hard-coded.tsx");
    await writeFile(translated, "export const View = () => <p>{t(key)}</p>;\n");
    await writeFile(
      hardCoded,
      'export const View = ({ ok }) => <><button title="Save">Save</button><button aria-label={`Delete`}>{"Delete"}</button><button aria-label={ok ? "Confirm" : "Cancel"}>{ok ? "Confirm" : "Cancel"}</button></>;\n',
    );

    expect(() =>
      execFileSync(process.execPath, [checker, translated], {
        encoding: "utf8",
      }),
    ).not.toThrow();
    const result = spawnSync(process.execPath, [checker, hardCoded], {
      encoding: "utf8",
    });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("title attribute:Save");
    expect(result.stderr).toContain("JSX text:Save");
    expect(result.stderr).toContain("aria-label attribute:Delete");
    expect(result.stderr).toContain("JSX expression:Delete");
    expect(result.stderr).toContain("aria-label attribute:Confirm");
    expect(result.stderr).toContain("JSX expression:Cancel");
  });

  it("rejects hard-coded Electron native dialog copy", async () => {
    const directory = await mkdtemp(path.join(tmpdir(), "spire-i18n-native-"));
    const hardCoded = path.join(directory, "native.ts");
    await writeFile(
      hardCoded,
      'export const options = { buttons: ["Cancel", "Quit"], title: "Unsaved changes", message: "Changes will be lost" };\n',
    );

    const result = spawnSync(process.execPath, [checker, hardCoded], {
      encoding: "utf8",
    });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("native dialog buttons:Cancel");
    expect(result.stderr).toContain("native dialog title:Unsaved changes");
  });
});
