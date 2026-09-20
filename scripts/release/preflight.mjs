import { execFileSync } from "node:child_process";
import { appendFileSync, readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

const SEMVER_TAG = /^v(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*)(?:\.(?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*))*))?$/;

export function validateTagAndVersion(tag, packageVersion) {
  if (!SEMVER_TAG.test(tag)) {
    throw new Error(`Release tag must be canonical semantic version vX.Y.Z[-prerelease], got: ${tag}`);
  }
  if (tag.slice(1) !== packageVersion) {
    throw new Error(`Tag ${tag} does not match package.json version ${packageVersion}`);
  }
  return { tag, version: packageVersion };
}

function git(args) {
  return execFileSync("git", args, { encoding: "utf8" }).trim();
}

export function runPreflight({ tag = process.env.RELEASE_TAG, output = process.env.GITHUB_OUTPUT } = {}) {
  if (!tag) throw new Error("RELEASE_TAG is required");
  const pkg = JSON.parse(readFileSync("package.json", "utf8"));
  const result = validateTagAndVersion(tag, pkg.version);

  git(["show-ref", "--verify", "--quiet", `refs/tags/${tag}`]);
  const tagCommit = git(["rev-list", "-n", "1", tag]);
  const headCommit = git(["rev-parse", "HEAD"]);
  if (tagCommit !== headCommit) {
    throw new Error(`Checked out commit ${headCommit} is not the commit for ${tag} (${tagCommit})`);
  }
  if (git(["status", "--porcelain"]) !== "") {
    throw new Error("Release source tree is not clean");
  }

  if (output) {
    appendFileSync(output, `tag=${result.tag}\nversion=${result.version}\ncommit=${headCommit}\n`);
  }
  console.log(`Release preflight passed: ${tag} -> ${headCommit}`);
  return { ...result, commit: headCommit };
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    runPreflight();
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}
