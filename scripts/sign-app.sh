#!/usr/bin/env bash
set -euo pipefail

app="${1:-src-tauri/target/release/bundle/macos/Pi App.app}"
[[ -d "$app" ]]
codesign --force --deep --sign - "$app"
codesign --verify --deep --strict "$app"
echo "Ad-hoc signed: $app"
