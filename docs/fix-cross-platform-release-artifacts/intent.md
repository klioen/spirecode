# Intent: 修复 GitHub Actions 跨平台安装包生成
Author: User。 Status: accepted。

## Problem

GitHub Actions `main` push run 35449795298 已成功生成 macOS ARM64 DMG，但 Windows x64 和 Linux x64 在 `pnpm bundle` 阶段失败：

- Windows：`prepare-pi-extensions.mjs` 已复制文件，但 manifest 使用平台原生分隔符，`REQUIRED_FILES` 使用 `/`，导致误报 `pi-memory/extensions/memory.ts` 缹失。
- Linux：electron-builder 未将直接 optional dependency `@mariozechner/clipboard-linux-x64-gnu` 放入产物，packaged-app smoke 检测到 native binary 缺失。

因此无法从同一次 Actions run 获取 macOS、Windows、Linux 三平台安装包。

## Proposed outcome

- Pi extension bundle manifest 在所有平台统一使用 POSIX 相对路径，Windows 校验通过。
- 当前平台对应的 clipboard native package 被确定性复制到 packaged app 的 unpacked resources，Linux/Windows smoke 可加载。
- GitHub Actions 在 main push 上成功上传：macOS DMG、Windows NSIS EXE、Linux AppImage 和 deb。
- 保留严格 smoke，不通过跳过检查来伪造成功。

## Affected users and systems

- GitHub Actions 三平台 release matrix。
- `scripts/prepare-pi-extensions.mjs`、Electron 打包配置/脚本、packaged-app smoke。
- 下载 Windows/Linux 安装包的用户。

## Constraints

- 依赖继续固定版本并由 `pnpm-lock.yaml` 约束。
- 不关闭 native binary smoke，不在 CI 中手工下载未锁定二进制。
- 只复制当前目标平台包，不把所有平台 native binary 塞入每个安装包。
- macOS 现有签名、DMG 和 smoke 行为不得回归。

## Open questions

无。失败日志和目标产物均已明确。
