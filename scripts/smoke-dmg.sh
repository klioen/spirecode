#!/usr/bin/env bash
set -euo pipefail

dmg="${1:-src-tauri/target/release/bundle/dmg/SpireCode_0.1.0_aarch64.dmg}"
mount_dir="$(mktemp -d "${TMPDIR:-/tmp}/spirecode-mount.XXXXXX")"
cleanup() {
  hdiutil detach "$mount_dir" -quiet >/dev/null 2>&1 || true
  rmdir "$mount_dir" >/dev/null 2>&1 || true
}
trap cleanup EXIT

verify_dmg() {
  local attempt
  for attempt in 1 2 3; do
    if hdiutil verify "$dmg" >/dev/null; then
      return 0
    fi
    if [[ "$attempt" -lt 3 ]]; then
      sleep 2
    fi
  done
  echo "DMG verification failed after 3 attempts: $dmg" >&2
  return 1
}

[[ -f "$dmg" ]]
verify_dmg
hdiutil attach "$dmg" -quiet -nobrowse -mountpoint "$mount_dir"
[[ -d "$mount_dir/SpireCode.app" ]]
[[ -L "$mount_dir/Applications" ]]
"$(dirname "$0")/smoke-app.sh" "$mount_dir/SpireCode.app"

echo "DMG smoke passed: $dmg"
