#!/bin/bash
set -euo pipefail

root="$(cd "$(dirname "$0")/.." && pwd)"
app="${1:-$root/release/mac-arm64/SpireCode.app}"
identity="${CSC_NAME:--}"

[[ -d "$app" ]]
codesign --force --deep --sign "$identity" "$app"
codesign --verify --deep --strict --verbose=2 "$app"
echo "Electron app signature verified: $app"
