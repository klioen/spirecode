import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { DiagnosticsService, sanitize } from "./service.js";

const temporaryDirectories: string[] = [];

async function service(): Promise<DiagnosticsService> {
  const root = await mkdtemp(path.join(os.tmpdir(), "spirecode-diagnostics-"));
  temporaryDirectories.push(root);
  return new DiagnosticsService(root, "1.2.3");
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe("diagnostics privacy", () => {
  it("redacts common credentials, private keys, and local paths", () => {
    const home = os.homedir();
    const input = [
      "Authorization: Bearer bearer-secret-value",
      "jwt=eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjMifQ.signature",
      '"refresh_token":"refresh-secret-value"',
      "https://user:password@example.com/private",
      "-----BEGIN PRIVATE KEY-----\\nprivate-material\\n-----END PRIVATE KEY-----",
      path.join(home, "Code", "secret-project", "source.ts"),
      "C:\\Users\\alice\\private-project\\source.ts",
    ].join("\n");

    const output = sanitize(input);

    for (const secret of [
      "bearer-secret-value",
      "eyJhbGciOiJIUzI1NiJ9",
      "refresh-secret-value",
      "user:password",
      "private-material",
      path.join(home, "Code", "secret-project"),
      "C:\\Users\\alice\\private-project",
    ]) {
      expect(output).not.toContain(secret);
    }
    expect(output).toContain("<home>");
  });

  it("copies only sanitized bounded log events", async () => {
    const diagnostics = await service();
    await diagnostics.log({
      level: "error",
      code: "APP_START_FAILED",
      safeContext: {
        errorType: "TypeError",
        detail: `Authorization: Bearer do-not-copy ${path.join(os.homedir(), "private", "file.ts")}`,
      },
    } as Parameters<DiagnosticsService["log"]>[0]);

    const report = await diagnostics.copyText();

    expect(report).toContain("APP_START_FAILED");
    expect(report).not.toContain("do-not-copy");
    expect(report).not.toContain(path.join(os.homedir(), "private"));
    expect(report).toContain('"errorType":"TypeError"');
  });
});
