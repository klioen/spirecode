#!/bin/bash
set -euo pipefail

root="$(cd "$(dirname "$0")/.." && pwd)"
source_app="$root/release/mac-arm64/SpireCode.app"
destination="/Applications/SpireCode.app"
staging="/Applications/.SpireCode.app.staging"
backup="/Applications/.SpireCode.app.backup"
executable="$destination/Contents/MacOS/SpireCode"
rollback=0

cleanup() {
  status=$?
  trap - EXIT INT TERM
  if ((rollback)); then
    rm -rf "$destination"
    if [[ -e "$backup" ]]; then
      mv "$backup" "$destination"
    fi
  fi
  rm -rf "$staging"
  exit "$status"
}
trap cleanup EXIT INT TERM

if [[ "$(uname -s)" != "Darwin" || "$(uname -m)" != "arm64" ]]; then
  echo "pnpm install:mac requires macOS arm64." >&2
  exit 1
fi

cd "$root"
pnpm bundle

[[ -d "$source_app" ]]
codesign --verify --deep --strict "$source_app"
source_hash="$(shasum -a 256 "$source_app/Contents/Resources/app.asar" | awk '{print $1}')"

rm -rf "$staging" "$backup"
ditto "$source_app" "$staging"
codesign --verify --deep --strict "$staging"

if pgrep -f '^/Applications/SpireCode\.app/Contents/MacOS/SpireCode($| )' >/dev/null; then
  pkill -TERM -f '^/Applications/SpireCode\.app/Contents/MacOS/SpireCode($| )' || true
  for _ in $(seq 1 50); do
    if ! pgrep -f '^/Applications/SpireCode\.app/Contents/MacOS/SpireCode($| )' >/dev/null; then
      break
    fi
    sleep 0.1
  done
fi
if pgrep -f '^/Applications/SpireCode\.app/Contents/MacOS/SpireCode($| )' >/dev/null; then
  echo "SpireCode did not stop; installation aborted." >&2
  exit 1
fi

rollback=1
if [[ -e "$destination" ]]; then
  mv "$destination" "$backup"
fi
mv "$staging" "$destination"
xattr -dr com.apple.quarantine "$destination" 2>/dev/null || true
codesign --verify --deep --strict "$destination"
installed_hash="$(shasum -a 256 "$destination/Contents/Resources/app.asar" | awk '{print $1}')"
if [[ "$installed_hash" != "$source_hash" ]]; then
  echo "Installed app hash does not match the bundle." >&2
  exit 1
fi
rm -rf "$backup"
rollback=0

open "$destination"
pid=""
for _ in $(seq 1 100); do
  pid="$(pgrep -f '^/Applications/SpireCode\.app/Contents/MacOS/SpireCode($| )' | head -n 1 || true)"
  [[ -z "$pid" ]] || break
  sleep 0.1
done
if [[ -z "$pid" ]]; then
  echo "SpireCode was installed but did not start." >&2
  exit 1
fi

echo "Installed and started SpireCode (PID $pid)."
echo "app.asar SHA-256: $installed_hash"
