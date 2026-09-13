#!/usr/bin/env bash
set -euo pipefail

root="$(cd "$(dirname "$0")/.." && pwd)"
app="$root/src-tauri/target/release/bundle/macos/Pi App.app"
out_dir="$root/src-tauri/target/release/bundle/dmg"
out="$out_dir/Pi App_0.1.0_aarch64.dmg"
staging="$(mktemp -d "${TMPDIR:-/tmp}/pi-app-dmg.XXXXXX")"
trap 'rm -rf "$staging"' EXIT

[[ -d "$app" ]] || {
  echo "Missing app bundle: $app" >&2
  exit 1
}

cp -R "$app" "$staging/"
ln -s /Applications "$staging/Applications"
mkdir -p "$out_dir"
rm -f "$out"
hdiutil create -quiet -volname "Pi App" -srcfolder "$staging" -ov -format UDZO "$out"

echo "DMG built: $out"
