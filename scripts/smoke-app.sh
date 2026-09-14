#!/usr/bin/env bash
set -euo pipefail

app="${1:-src-tauri/target/release/bundle/macos/SpireCode.app}"
plist="$app/Contents/Info.plist"
binary="$app/Contents/MacOS/spirecode"

[[ -d "$app" ]]
[[ -f "$plist" ]]
[[ -x "$binary" ]]
[[ "$(/usr/libexec/PlistBuddy -c 'Print :CFBundleIdentifier' "$plist")" == "com.bytedance.spirecode.dev" ]]
[[ "$(/usr/libexec/PlistBuddy -c 'Print :LSMinimumSystemVersion' "$plist")" == "13.0" ]]
file "$binary" | grep -q 'arm64'
codesign --verify --deep --strict "$app"

echo "App smoke passed: $app"
