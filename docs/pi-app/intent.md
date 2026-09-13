# Intent: 基于 Tauri 的 pi-app macOS 客户端
Author: keliangliang。 Status: accepted。

## Problem

需要一个可以安装到 macOS 的 pi-app 客户端，提供本地开发工作台的基础能力：Projects、Files、Git Changes 和 Terminal。现有 ThinkRail 已验证这套产品信息架构，但其桌面宿主和本地服务基于 Electrobun/Bun；直接采用 GPUI 又会显著增加编辑器、终端渲染、IME 和跨平台维护成本。

## Proposed outcome

交付一个 Apple Silicon macOS 桌面应用：

- 使用 Tauri 2 打包为 `.app` 和 `.dmg`，复用 macOS 系统 WKWebView，不内置 Chromium。
- 前端采用 ThinkRail 同类技术栈与交互：React、TypeScript、Zustand、Tailwind CSS、Radix/shadcn、Monaco、xterm.js。
- 后端使用 Rust，负责项目目录、文件读取与监听、Git 状态与 diff、PTY 和本地持久化。
- V1 提供 Projects、Files、Git Changes、Terminal 四个功能面；Chat 不实现。
- V1 文件区域是只读源码查看器，不包含保存、dirty buffer、LSP 或完整 IDE 编辑能力。
- 产物可在本机安装、启动并打开本地 Git 项目。

## Affected users and systems

- 主要用户：在 macOS 上使用 pi 和本地 Git 仓库的开发者。
- 新建系统：`/Users/bytedance/Code/pi-ide` 中的 Tauri 桌面应用。
- 参考系统：`/Users/bytedance/ai/thinkrail` 的产品交互与 React 前端组织。
- 本地依赖：系统 Git、用户默认 shell、macOS WKWebView。

## Constraints

- 桌面后端必须使用 Rust/Tauri，前端运行在系统 WebView 中。
- 不采用 Electron、Electrobun 或 GPUI。
- 不复制 ThinkRail 的 Bun server/WebSocket 架构；进程内调用使用 Tauri command/channel/event。
- 不直接复制 ThinkRail 代码；参考其产品行为和模块边界重新实现。
- WebView 不获得通用文件系统或 shell 权限；本地能力通过窄化的 Rust command 暴露。
- 文件访问必须限制在已打开 project 的 canonical root 内，并防止 symlink 逃逸。
- Git 参数必须通过 `std::process::Command` 参数数组传递，不经过 shell 拼接。
- V1 优先支持 Apple Silicon 和 macOS 13+。
- Chat、文件写入、LSP、Git mutation、managed worktree、远程访问不在 V1 范围。

## Open questions

- 正式 bundle identifier、产品显示名和图标可在实现计划中先使用可替换的开发默认值。
- Developer ID 签名和 Apple notarization 取决于后续是否提供发布凭据；本地 ad-hoc 安装不受影响。
- Windows/Linux 支持不属于 V1 验收，但模块不得主动依赖 macOS 专属业务逻辑，原生目录选择和打包配置除外。
