# Intent: Windows 和 Linux 打包支持
Author: User。 Status: draft。

## Problem

SpireCode 当前的 Electron 业务代码大体保持平台中立，但发布流水线只支持 Apple Silicon macOS：`pnpm bundle` 固定执行 `electron-builder --mac --arm64`，打包配置只有 DMG，签名与 smoke 脚本依赖 macOS 命令。Terminal 默认 shell 和 Chat 的登录 shell 环境读取也包含 `/bin/zsh` 假设。因此无法可靠地产出和验证 Windows、Linux 安装包。

## Proposed outcome

- 保留当前 macOS arm64 `.app` / `.dmg` 打包、签名和 smoke 行为。
- 在 Windows x64 原生 runner 上构建 NSIS `.exe` 安装包。
- 在 Linux x64 原生 runner 上构建 AppImage 和 deb 安装包。
- `pnpm bundle` 根据宿主平台选择正确目标，不在 macOS 上交叉打包含 `node-pty` 的其他平台产物。
- Terminal 在 Windows 使用系统命令解释器，在 Unix 平台继续使用用户 shell 和安全回退。
- macOS 专属 ARK API Key 登录 shell bootstrap 在其他平台安全跳过。
- CI 对三个平台分别运行检查、打包和最终产物 smoke，并上传对应产物。

## Affected users and systems

- 使用 Windows x64、Linux x64 和 macOS arm64 的 SpireCode 用户。
- Electron Main 的 Terminal 和 Chat 环境初始化。
- electron-builder 配置、打包脚本、smoke 脚本和 GitHub Actions。
- `node-pty` 原生模块在各目标平台上的重建及加载验证。

## Constraints

- Renderer 的 sandbox、context isolation、typed IPC 和路径安全边界不得变化。
- Git 继续使用参数数组，不能引入 shell command string。
- npm 依赖保持精确锁定；本次不升级 Electron、electron-builder、node-pty 或 pi SDK。
- 原生模块必须在目标 OS 上安装、构建和验证；不支持从 macOS 交叉构建 Windows/Linux 发布包。
- 首批 Windows/Linux 仅支持 x64；macOS 继续仅支持 arm64。
- 首批发布可以不包含正式代码签名，但 Windows 和 macOS 的生产分发签名属于后续发布配置。

## Open questions

- Windows Authenticode、macOS Developer ID/notarization 和 Linux 仓库签名需要后续提供发布凭据后启用。
- arm64 Windows/Linux 暂不纳入首批验收。
