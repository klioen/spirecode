#!/usr/bin/env bash
set -euo pipefail

dmg="${1:-src-tauri/target/release/bundle/dmg/Pi App_0.1.0_aarch64.dmg}"
mount_dir="$(mktemp -d "${TMPDIR:-/tmp}/pi-app-mount.XXXXXX")"
cleanup() {
  hdiutil detach "$mount_dir" -quiet >/dev/null 2>&1 || true
  rmdir "$mount_dir" >/dev/null 2>&1 || true
}
trap cleanup EXIT

[[ -f "$dmg" ]]
hdiutil verify "$dmg" >/dev/null
hdiutil attach "$dmg" -quiet -nobrowse -mountpoint "$mount_dir"
[[ -d "$mount_dir/Pi App.app" ]]
[[ -L "$mount_dir/Applications" ]]
"$(dirname "$0")/smoke-app.sh" "$mount_dir/Pi App.app"

echo "DMG smoke passed: $dmg"
