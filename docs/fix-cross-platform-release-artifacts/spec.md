# Spec: 修复 GitHub Actions 跨平台安装包生成
Status: accepted。 Implements: `docs/fix-cross-platform-release-artifacts/intent.md`。

## Pi extension manifest portability

- `prepare-pi-extensions.mjs` 写入 manifest 前必须把 `path.relative()` 结果的 separator 归一化为 `/`。
- `REQUIRED_FILES` 保持 POSIX 相对路径，manifest 在 macOS/Linux/Windows 上 bitwise 使用同一 key schema。
- 添加确定性单测，传入 Windows 风格路径并断言得到 POSIX key；不得依赖实际 Windows runner 才覆盖。

## Native clipboard packaging

- 根据目标 `process.platform/process.arch` 解析唯一允许的 clipboard package：
  - darwin-arm64 → `@mariozechner/clipboard-darwin-arm64`
  - win32-x64 → `@mariozechner/clipboard-win32-x64-msvc`
  - linux-x64 → `@mariozechner/clipboard-linux-x64-gnu`
- 在 electron-builder 完成 unpacked directory 后、packaged-app smoke 前，将当前平台包从 pnpm install tree 确定性复制到 `resources/app.asar.unpacked/node_modules/@mariozechner/<package>`。
- 源包必须可由 lockfile/installed dependency 解析；缺失时立即失败，不从网络动态下载。
- 拒绝源目录或复制内容中的 symlink，避免把依赖树外内容带入产物。
- packaged-app smoke 继续验证 native binary 文件并实际 `require()` 对应 package。
- 最终 NSIS/AppImage/deb 使用已验证的 prepackaged directory，因此携带同一 native package。

## CI artifact behavior

- 保持 main push 才 bundle/upload 的现有策略。
- 成功 run 上传：
  - `spirecode-macos-arm64`: `release/*.dmg`
  - `spirecode-windows-x64`: `release/*.exe`
  - `spirecode-linux-x64`: `release/*.AppImage`, `release/*.deb`
- 不将 audit 的既有 continue-on-error 改成 release 绕过条件。

## Proof

- 脚本单测覆盖 Windows separator 归一化和当前平台 clipboard package mapping/copy guard。
- macOS 本地 `pnpm bundle` 继续通过。
- `pnpm check` 通过。
- PR 合并后的 main GitHub Actions 三个 matrix job 全绿，四类安装文件均出现在 artifacts。
