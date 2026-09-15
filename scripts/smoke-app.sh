#!/bin/bash
set -euo pipefail

root="$(cd "$(dirname "$0")/.." && pwd)"
app="${1:-$root/release/mac-arm64/SpireCode.app}"

[[ -d "$app" ]]
codesign --verify --deep --strict --verbose=2 "$app"
[[ "$(/usr/libexec/PlistBuddy -c 'Print :CFBundleIdentifier' "$app/Contents/Info.plist")" == "com.bytedance.spirecode.dev" ]]
[[ "$(/usr/libexec/PlistBuddy -c 'Print :CFBundleName' "$app/Contents/Info.plist")" == "SpireCode" ]]
file "$app/Contents/MacOS/SpireCode" | grep -q 'arm64'

node "$root/scripts/check-pi-extensions.mjs" \
  "$app/Contents/Resources/pi-extensions"
memory_worker="$app/Contents/Resources/pi-extensions/pi-memory/worker/worker.cjs"
[[ -f "$memory_worker" ]]
[[ ! -L "$memory_worker" ]]

pty="$(find "$app/Contents/Resources/app.asar.unpacked" -name pty.node -print -quit)"
[[ -n "$pty" ]]
file "$pty" | grep -q 'arm64'

asar="$root/node_modules/@electron/asar/bin/asar.js"
[[ -f "$asar" ]]
listing="$(node "$asar" list "$app/Contents/Resources/app.asar")"
grep -q '^/dist/index.html$' <<<"$listing"
grep -q '^/dist-electron/main.js$' <<<"$listing"
grep -q '^/dist-electron/preload.cjs$' <<<"$listing"
grep -q '^/node_modules/@earendil-works/pi-coding-agent/' <<<"$listing"
if grep -qE '\.(map)$|\.test\.' <<<"$listing"; then
  echo "Source maps or tests were included in app.asar" >&2
  exit 1
fi

executable="$app/Contents/MacOS/SpireCode"
ELECTRON_RUN_AS_NODE=1 "$executable" -e '
  const { createRequire } = require("node:module");
  const requireFromApp = createRequire(process.argv[1] + "/package.json");
  const pty = requireFromApp("node-pty");
  const terminal = pty.spawn("/bin/sh", ["-c", "printf pty-ok"], {
    cols: 80, rows: 24, cwd: "/tmp", env: process.env
  });
  let output = "";
  terminal.onData((data) => output += data);
  terminal.onExit(() => process.exit(output.includes("pty-ok") ? 0 : 2));
' "$app/Contents/Resources/app.asar"
PI_OFFLINE=1 ELECTRON_RUN_AS_NODE=1 "$executable" -e '
  const entry = "file://" + process.argv[1] + "/node_modules/@earendil-works/pi-coding-agent/dist/index.js";
  import(entry).then(async (sdk) => {
    if (typeof sdk.createAgentSession !== "function") process.exit(2);
    const runtime = await sdk.ModelRuntime.create();
    process.exit(typeof runtime.getAvailable === "function" ? 0 : 2);
  }).catch((error) => { console.error(error); process.exit(1); });
' "$app/Contents/Resources/app.asar"

user_data="$(mktemp -d)"
log="$(mktemp)"
cleanup() {
  if [[ -n "${pid:-}" ]] && kill -0 "$pid" 2>/dev/null; then
    kill "$pid" 2>/dev/null || true
    wait "$pid" 2>/dev/null || true
  fi
  rm -rf "$user_data" "$log"
}
trap cleanup EXIT

"$app/Contents/MacOS/SpireCode" --user-data-dir="$user_data" >"$log" 2>&1 &
pid=$!
sleep 5
if ! kill -0 "$pid" 2>/dev/null; then
  cat "$log"
  exit 1
fi

echo "Electron app smoke passed: $app"
