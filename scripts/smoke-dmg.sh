#!/bin/bash
set -euo pipefail

root="$(cd "$(dirname "$0")/.." && pwd)"
dmg="${1:-$root/release/SpireCode-0.1.0-arm64.dmg}"
mount="$(mktemp -d)"
cleanup() {
  hdiutil detach "$mount" -quiet 2>/dev/null || true
  rmdir "$mount" 2>/dev/null || true
}
trap cleanup EXIT

[[ -f "$dmg" ]]
hdiutil attach -nobrowse -readonly -mountpoint "$mount" "$dmg" >/dev/null
[[ -d "$mount/SpireCode.app" ]]
"$root/scripts/smoke-app.sh" "$mount/SpireCode.app"
echo "Electron DMG smoke passed: $dmg"
