import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const workflow = await readFile(".github/workflows/release.yml", "utf8");
const ciWorkflow = await readFile(".github/workflows/ci.yml", "utf8");
const releaseBuild = await readFile("scripts/release/build.mjs", "utf8");
const packageManifest = JSON.parse(await readFile("package.json", "utf8"));
const packagingScripts = await Promise.all(
  [
    "scripts/electron-dev.mjs",
    "scripts/package-electron.mjs",
    "scripts/smoke-app.sh",
    "scripts/smoke-packaged-app.mjs",
    "scripts/release/sbom.mjs",
  ].map((file) => readFile(file, "utf8")),
);
const sbomScript = packagingScripts[4];

test("release workflow is tag-only and has three platform builds", () => {
  assert.match(workflow, /tags:\s*\["v\*\.\*\.\*"\]/);
  for (const os of ["macos-14", "windows-latest", "ubuntu-latest"]) assert.match(workflow, new RegExp(os));
  assert.doesNotMatch(workflow, /workflow_dispatch/);
});

test("official packaging fails closed on signing credentials", () => {
  for (const secret of ["APPLE_CERTIFICATE", "APPLE_CERTIFICATE_PASSWORD", "APPLE_ID", "APPLE_APP_SPECIFIC_PASSWORD", "APPLE_TEAM_ID", "WINDOWS_CERTIFICATE", "WINDOWS_CERTIFICATE_PASSWORD"]) {
    assert.match(workflow, new RegExp(secret));
  }
  assert.match(workflow, /environment:\s*release-signing/);
  assert.match(workflow, /name:\s*release-publish/);
  assert.match(workflow, /run: pnpm release:build/);
  assert.match(releaseBuild, /smoke-installer\.mjs/);
  assert.doesNotMatch(workflow, /continue-on-error:\s*true/);
  assert.doesNotMatch(workflow, /CSC_IDENTITY_AUTO_DISCOVERY:\s*["']?false/);
});

test("draft creation precedes protected publication and supply-chain metadata", () => {
  assert.match(workflow, /gh release create[\s\S]*--draft/);
  assert.match(workflow, /gh release edit .*--draft=false/);
  assert.match(workflow, /SHA256SUMS\.txt/);
  assert.match(workflow, /sbom\.cdx\.json/);
});

test("all actions are pinned to full commit SHAs", () => {
  for (const contents of [workflow, ciWorkflow]) {
    const refs = [
      ...contents.matchAll(/^\s*-?\s*uses:\s*[^@\s]+@([^\s#]+)/gm),
    ].map((match) => match[1]);
    assert.ok(refs.length >= 3);
    for (const ref of refs) assert.match(ref, /^[0-9a-f]{40}$/);
  }
});

test("CI does not expose credential-bearing git URL rewrites", () => {
  assert.doesNotMatch(ciWorkflow, /CI_GITHUB_TOKEN/);
  assert.doesNotMatch(ciWorkflow, /insteadOf/);
  assert.match(ciWorkflow, /Bundle and smoke native artifact[\s\S]*run: pnpm bundle/);
});

test("build and release no longer stage or license-gate removed bundled resources", () => {
  const removedResource = ["pi", "extensions"].join("-");
  assert.ok(!workflow.includes(removedResource));
  assert.ok(!packagingScripts.slice(0, 3).some((script) => script.includes(removedResource)));
  assert.ok(!packagingScripts[4].includes(removedResource));
  assert.ok(!Object.hasOwn(packageManifest.devDependencies, removedResource));
  assert.ok(
    !packageManifest.build.extraResources.some(
      (resource) => resource.from.includes(removedResource) || resource.to.includes(removedResource),
    ),
  );
  assert.equal(
    packageManifest.scripts[["legal", "release-check"].join(":")],
    undefined,
  );
  assert.equal(packageManifest.scripts[["legal", "test"].join(":")], undefined);
  assert.match(workflow, /pnpm install --frozen-lockfile/);
  assert.match(workflow, /pnpm secrets:check/);
  assert.match(workflow, /pnpm licenses:check/);
  assert.match(workflow, /pnpm audit --prod --audit-level moderate/);
});

test("SBOM includes Electron runtime and emits valid scoped npm PURLs", () => {
  assert.match(sbomScript, /name: "electron"/);
  assert.match(sbomScript, /desktop-runtime/);
  assert.match(
    sbomScript,
    /name\.slice\(1\)\.split\("\/"\)\[0\][\s\S]*\/\$\{encodeURIComponent\(name\.split\("\/"\)/,
  );
});

test("packaged app smoke rejects the removed resource directory", () => {
  assert.ok(packagingScripts[3].includes("removedBundledResource"));
  assert.match(packagingScripts[3], /pathExists\(path\.join\(resources, removedBundledResource\)\)/);
  assert.match(packagingScripts[3], /must not include/);
});
