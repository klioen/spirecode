# Spec: Windows 和 Linux 打包支持

## Requirements

1. `pnpm bundle` 必须在 `darwin`、`win32`、`linux` 上分别生成该宿主支持的发布产物；未知平台必须明确失败。
2. macOS arm64 继续生成 DMG，并保留现有 ad-hoc signing、app smoke 和 DMG smoke。
3. Windows x64 生成 NSIS 安装程序；Linux x64 生成 AppImage 和 deb。
4. 所有平台都必须在打包前运行 Pi 扩展准备、完整性检查和应用构建。
5. 所有平台的最终解包应用都必须验证静态资源、Main/Preload、Pi SDK、Pi 扩展和目标平台 `node-pty`。
6. Windows Terminal 默认使用 `COMSPEC` 指定的绝对可执行文件；无有效 `COMSPEC` 时回退到系统目录下的 `cmd.exe`。
7. 非 Windows Terminal 优先使用有效的绝对 `$SHELL`，然后依次回退到 `/bin/zsh`、`/bin/bash`、`/bin/sh`。
8. ARK API Key 的 `/bin/zsh -ilc` bootstrap 只在 macOS 执行；Windows/Linux 不执行 macOS 专属探测，也不覆盖已继承的 key。
9. GitHub Actions 使用目标平台原生 runner 安装依赖、执行 `pnpm check`、打包和上传产物。

## Design

### Package configuration

`package.json` 的 electron-builder 配置新增：

- Windows：NSIS x64、安装目录可选、`.ico` 图标。
- Linux：AppImage 和 deb x64、Development category、PNG 图标目录。
- `asarUnpack` 继续覆盖 `node-pty`。

图标由现有 `assets/icon.icns` 的高分辨率图层派生为 Windows `.ico` 和 Linux PNG 集合，并提交生成产物，避免 CI 依赖额外图像工具。

### Platform dispatcher

`scripts/package-electron.mjs` 保留公共的 clean → prepare resources → check resources → build 流程，然后按 `process.platform` 分派：

- Darwin：沿用当前 dir → verify extensions → sign → DMG → app smoke → DMG smoke。
- Windows：先构建 unpacked app 并执行 PowerShell smoke，再生成 NSIS。
- Linux：先构建 unpacked app 并执行 shell smoke，再生成 AppImage/deb。

所有子进程继续通过 executable + argument array 启动，不使用拼接 shell 命令。

### Artifact smoke

新增平台 smoke 脚本，检查：

- unpacked app 和 executable 存在；
- `app.asar` 含 Renderer、Main、Preload、Pi SDK，且不含 source maps/test；
- bundled Pi extensions 完整性检查通过；
- `app.asar.unpacked` 中存在目标平台的 `pty.node`；
- 使用 Electron executable 的 `ELECTRON_RUN_AS_NODE=1` 加载并实际 spawn `node-pty`；
- Pi SDK 可 import 且 `ModelRuntime.create()` 可离线初始化；
- GUI 进程能启动并保持存活一个有界时间，然后由 smoke 主动结束。

Windows 使用 PowerShell 脚本，Linux 使用 Bash。安装器本身至少验证文件存在且非空；安装交互/系统级安装不在 CI 中执行。

### CI

`.github/workflows/ci.yml` 改为三平台 matrix：

- macOS 14 / arm64 target
- Windows latest / x64 target
- Ubuntu latest / x64 target

PR 至少运行三平台 `pnpm check`，main push 额外执行各自 `pnpm bundle` 并上传按平台命名的 artifact。Linux runner 安装 electron-builder 构建 deb/AppImage 所需系统包。

## Compatibility and security

- 不改变 Renderer 能力、BrowserWindow 安全选项或 IPC contract。
- `COMSPEC` 只有在绝对路径且文件存在时才采用，避免通过 PATH 或用户输入执行任意命令。
- shell bootstrap 不记录 key 或 shell 输出。
- 打包脚本不把凭据写入产物；签名凭据留给后续 CI secret 配置。

## Concerns

- **Unsigned distribution:** Windows 首次运行可能显示 SmartScreen，macOS 当前 ad-hoc 签名不适合公开分发。功能打包与正式签名分开验收。
- **Linux runtime matrix:** AppImage/deb 在 Ubuntu runner 通过不代表所有发行版均兼容；首批以 Ubuntu LTS 系为支持基线。
- **Native module ABI:** `node-pty` 是最高风险点，必须在每个目标 OS 的最终 unpacked artifact 中实测，不能只检查文件存在。
