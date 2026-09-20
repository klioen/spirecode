import { execFileSync, spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

function required(names) {
  const missing = names.filter((name) => !process.env[name]);
  if (missing.length) throw new Error(`Missing required official release secrets: ${missing.join(", ")}`);
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { stdio: "inherit", windowsHide: true, ...options });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${command} exited with ${result.status ?? result.signal}`);
}

function pnpm(args, env = process.env) {
  const npmExecPath = process.env.npm_execpath;
  run(npmExecPath ? process.execPath : "pnpm", npmExecPath ? [npmExecPath, ...args] : args, { env });
}

function decodeSecret(name, destination) {
  writeFileSync(destination, Buffer.from(process.env[name], "base64"), { mode: 0o600 });
}

function artifacts(extension) {
  return readdirSync("release").filter((name) => name.endsWith(extension)).map((name) => path.join("release", name));
}

async function mac() {
  required(["APPLE_CERTIFICATE", "APPLE_CERTIFICATE_PASSWORD", "APPLE_SIGNING_IDENTITY", "APPLE_ID", "APPLE_APP_SPECIFIC_PASSWORD", "APPLE_TEAM_ID"]);
  const temporary = mkdtempSync(path.join(os.tmpdir(), "spirecode-release-"));
  const certificate = path.join(temporary, "certificate.p12");
  const keychain = path.join(temporary, "release.keychain-db");
  const keychainPassword = randomUUID();
  try {
    decodeSecret("APPLE_CERTIFICATE", certificate);
    run("security", ["create-keychain", "-p", keychainPassword, keychain]);
    run("security", ["set-keychain-settings", "-lut", "21600", keychain]);
    run("security", ["unlock-keychain", "-p", keychainPassword, keychain]);
    run("security", ["import", certificate, "-k", keychain, "-P", process.env.APPLE_CERTIFICATE_PASSWORD, "-T", "/usr/bin/codesign", "-T", "/usr/bin/security"]);
    run("security", ["set-key-partition-list", "-S", "apple-tool:,apple:,codesign:", "-s", "-k", keychainPassword, keychain]);
    const existing = execFileSync("security", ["list-keychains", "-d", "user"], { encoding: "utf8" }).match(/"([^"]+)"/g)?.map((value) => value.slice(1, -1)) ?? [];
    run("security", ["list-keychains", "-d", "user", "-s", keychain, ...existing]);
    pnpm(["bundle"], { ...process.env, CSC_NAME: process.env.APPLE_SIGNING_IDENTITY });
    const app = path.join("release", "mac-arm64", "SpireCode.app");
    run("codesign", ["--force", "--deep", "--options", "runtime", "--timestamp", "--sign", process.env.APPLE_SIGNING_IDENTITY, app]);
    run("codesign", ["--verify", "--deep", "--strict", "--verbose=2", app]);
    for (const dmg of artifacts(".dmg")) rmSync(dmg, { force: true });
    pnpm(["exec", "electron-builder", "--prepackaged", app, "--mac", "dmg", "--arm64", "--publish", "never"], { ...process.env, CSC_IDENTITY_AUTO_DISCOVERY: "false" });
    const dmgs = artifacts(".dmg");
    if (dmgs.length !== 1) throw new Error(`Expected exactly one DMG, found ${dmgs.length}`);
    run("xcrun", ["notarytool", "submit", dmgs[0], "--apple-id", process.env.APPLE_ID, "--password", process.env.APPLE_APP_SPECIFIC_PASSWORD, "--team-id", process.env.APPLE_TEAM_ID, "--wait"]);
    run("xcrun", ["stapler", "staple", dmgs[0]]);
    run("xcrun", ["stapler", "validate", dmgs[0]]);
    run("spctl", ["--assess", "--type", "execute", "--verbose=2", app]);
    run("spctl", ["--assess", "--type", "open", "--context", "context:primary-signature", "--verbose=2", dmgs[0]]);
    run("./scripts/smoke-dmg.sh", [dmgs[0]]);
  } finally {
    spawnSync("security", ["delete-keychain", keychain], { stdio: "ignore" });
    rmSync(temporary, { recursive: true, force: true });
  }
}

async function windows() {
  required(["WINDOWS_CERTIFICATE", "WINDOWS_CERTIFICATE_PASSWORD"]);
  const temporary = mkdtempSync(path.join(os.tmpdir(), "spirecode-release-"));
  const certificate = path.join(temporary, "certificate.pfx");
  try {
    decodeSecret("WINDOWS_CERTIFICATE", certificate);
    pnpm(["bundle"]);
    const appDirectory = path.join("release", "win-unpacked");
    const signScript = "$ErrorActionPreference='Stop'; $tool=Get-ChildItem \"${env:ProgramFiles(x86)}\\Windows Kits\\10\\bin\\*\\x64\\signtool.exe\" | Sort-Object FullName -Descending | Select-Object -First 1; if (!$tool) { throw 'signtool.exe not found' }; $targets=Get-ChildItem -LiteralPath $args[2] -Recurse -File -Filter *.exe; if (!$targets) { throw 'No executables found to sign' }; foreach ($target in $targets) { & $tool.FullName sign /fd SHA256 /td SHA256 /tr https://timestamp.digicert.com /f $args[0] /p $args[1] $target.FullName; if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE } }";
    run("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", signScript, certificate, process.env.WINDOWS_CERTIFICATE_PASSWORD, appDirectory]);
    for (const installer of artifacts(".exe")) rmSync(installer, { force: true });
    pnpm(["exec", "electron-builder", "--prepackaged", appDirectory, "--win", "nsis", "--x64", "--publish", "never"], { ...process.env, CSC_IDENTITY_AUTO_DISCOVERY: "false" });
    const installers = artifacts(".exe");
    if (installers.length !== 1) throw new Error(`Expected exactly one Windows installer, found ${installers.length}`);
    const signFileScript = signScript.replace("Get-ChildItem -LiteralPath $args[2] -Recurse -File -Filter *.exe", "Get-Item -LiteralPath $args[2]");
    run("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", signFileScript, certificate, process.env.WINDOWS_CERTIFICATE_PASSWORD, installers[0]]);
    const verifyScript = "$ErrorActionPreference='Stop'; $targets=@(Get-ChildItem -LiteralPath $args[0] -Recurse -File -Filter *.exe) + @(Get-Item -LiteralPath $args[1]); foreach ($p in $targets) { $s=Get-AuthenticodeSignature -LiteralPath $p.FullName; if ($s.Status -ne 'Valid') { throw \"Invalid Authenticode signature for $($p.FullName): $($s.Status)\" } }";
    run("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", verifyScript, appDirectory, installers[0]]);
    run(process.execPath, ["scripts/release/smoke-installer.mjs"]);
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
}

if (process.platform === "darwin") await mac();
else if (process.platform === "win32") await windows();
else if (process.platform === "linux") {
  pnpm(["bundle"]);
  run(process.execPath, ["scripts/release/smoke-installer.mjs"]);
}
else throw new Error(`Unsupported release platform: ${process.platform}`);
