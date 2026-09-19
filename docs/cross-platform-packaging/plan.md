# Plan: Windows 和 Linux 打包支持（from docs/cross-platform-packaging/spec.md 2026-10-05）

## Files that change

- `docs/cross-platform-packaging/{intent,spec,plan}.md`：记录需求、设计、实施顺序和验收证据。
- `package.json`：增加平台 build target、图标配置、发布元数据和目标平台 native optional dependencies。
- `assets/icon.ico`、`assets/icons/*.png`：Windows 和 Linux 应用图标。
- `scripts/package-electron.mjs`：从 macOS 固定流水线改为目标宿主平台分派，同时保持公共准备步骤。
- `scripts/smoke-packaged-app.mjs`：跨平台验证 Windows/Linux unpacked app、asar、Pi 扩展、node-pty、Pi SDK 和 GUI 启动；Linux 由 dispatcher 在 `xvfb-run` 下调用。
- `electron/domains/terminal/service.ts`：增加 Windows/Unix 默认 shell 选择。
- `electron/domains/terminal/service.test.ts`：覆盖 Windows COMSPEC、Unix fallback，并使用宿主平台期望 shell。
- `electron/domains/persistence/{index.ts,persistence.test.ts}`：Windows 保留文件 fsync，但容忍目录 fsync 的 `EPERM` / `EINVAL`。
- `electron/domains/filesystem/pathGuard.ts`：同时拒绝 POSIX 和 Windows 风格的绝对路径与 traversal 分隔符。
- `electron/domains/chat/bundledResources.ts`：将 Windows drive 绝对路径识别为本地 package source。
- `electron/domains/settings/index.ts`：先识别 Windows/POSIX 绝对路径再识别 URI scheme，避免将 Windows drive letter 误判为协议。
- `electron/domains/worktrees/worktrees.test.ts`：canonicalize Git porcelain 返回路径后断言，兼容 Windows 的 `/`、大小写和短路径表示。
- `electron/core/gitProcess.ts`：超时/输出超限后等待 Git 子进程真正关闭再返回，避免 Windows 临时目录锁残留。
- `electron/security/navigation.test.ts`：使用宿主平台生成的 file URL fixture。
- `electron/domains/chat/shellEnvironment.ts`：限制登录 zsh bootstrap 的平台范围。
- `electron/domains/chat/shellEnvironment.test.ts`：覆盖非 macOS 跳过行为。
- `.github/workflows/ci.yml`：增加 macOS、Windows、Linux 原生 matrix build、bundle 和 artifact upload。
- `.gitattributes`：强制跨平台 checkout 对源文件保持 LF，避免 Windows 自动 CRLF 转换破坏 Prettier gate。
- `AGENTS.md`：更新跨平台打包命令和 artifact 说明。

## Order of work

1. 将 shell 选择和 ARK 登录 shell bootstrap 变成可注入平台、可单测的逻辑；平台特定测试显式传入平台，避免依赖测试 runner 的宿主 OS。
2. 从现有 macOS 图标生成并提交 Windows/Linux 图标，配置 electron-builder 的 NSIS、AppImage 和 deb target。
3. 重构 package dispatcher，公共阶段只实现一次，平台特有签名、产物生成和 smoke 明确分支。
4. 增加共享的 Windows/Linux artifact smoke；复用现有 Pi 扩展校验器和 asar API，实测最终 artifact 内的原生模块与 SDK。
5. 将 CI 改为三平台 matrix，在 PR 执行检查，在 main push 打包并上传平台产物；用 `.gitattributes` 保证 Windows checkout 后 Prettier 看到的换行不漂移。
6. 根据三平台 PR CI 修复 Windows 暴露的目录 fsync、路径语义、Git 子进程清理和平台相关测试 fixture，禁止整个平台跳过测试。
7. 更新工程指南，运行格式、lint、typecheck、单元测试和当前 macOS bundle 回归。

## Risks

- 最危险步骤是 `node-pty`：其 native binary 与 OS、CPU、Electron ABI 强绑定。规避方式是每个平台原生安装并在最终 unpacked app 中实际 spawn PTY。
- Windows 路径和 executable 名称与 Unix 不同；共享 Node smoke 必须使用平台路径 API和参数数组，并在强制终止时清理 Windows 进程树。
- Linux GUI smoke 在无桌面 CI 中需要 `xvfb-run`；如果 runner 缺包则显式安装，不能静默跳过 GUI 启动。
- 将 CI 扩为三平台会提高时长和 runner 消耗，但比在 macOS 交叉构建更可靠。
- 不采用单个 shell 脚本兼容三平台，因为 quoting、进程生命周期和签名工具差异会让验证脆弱。
- 不在首批加入 arm64 Windows/Linux，也不把代码签名密钥配置和跨平台功能打包耦合。

## Proof

- `pnpm check`
- `pnpm bundle`（当前 macOS arm64 主机，证明旧 DMG 流程无回归）
- Windows CI：`pnpm bundle`，PowerShell artifact smoke 通过，上传 NSIS `.exe`。
- Linux CI：`pnpm bundle`，在 `xvfb-run` 下 artifact smoke 通过，上传 `.AppImage` 和 `.deb`。
- 检查三个平台 artifact 都包含完整 Pi 扩展、Pi SDK、Renderer/Main/Preload，并能从最终产物加载和运行 `node-pty`。
