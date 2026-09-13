# Plan: 基于 Tauri 的 pi-app macOS 客户端（from `docs/pi-app/spec.md` 2026-09-13）

## 1. 交付策略

按可独立验证的纵向阶段实现，每一阶段都保持仓库可格式化、可测试、可构建。先建立 Tauri/WKWebView 最小闭环，再依次加入 Projects、Files、Git Changes 和 Terminal；不先搭建未被当前需求使用的通用框架。

V1 目标是 Apple Silicon macOS 13+。代码保持平台中立，但不把 Windows/Linux 打包作为本轮完成条件。

## 2. Files that change

以下为计划中的目标结构；实现中如 Tauri/Vite 官方脚手架生成文件名存在差异，将在同一提交内同步更新本计划。

### 2.1 仓库与开发约定

```text
AGENTS.md
.gitignore
.editorconfig
README.md
package.json
pnpm-lock.yaml
vite.config.ts
tsconfig.json
tsconfig.node.json
index.html
components.json
scripts/check.mjs
```

职责：

- `AGENTS.md`：记录架构边界、固定命令、健康输出和常见错误，保持一页以内。
- `README.md`：开发、测试、构建和本地安装说明。
- `package.json`：统一 `dev/build/test/lint/typecheck/check/tauri` 命令。
- `scripts/check.mjs`：一条命令串行运行前端和 Rust 全部门槛，任一失败退出非零。

### 2.2 React 应用壳

```text
src/main.tsx
src/app/App.tsx
src/app/AppErrorBoundary.tsx
src/app/bootstrap.ts
src/styles/index.css
src/styles/theme.css
src/assets/
```

职责：

- 初始化 React、全局错误边界和 Tauri bindings。
- 建立 ThinkRail 风格的暗色开发工作台视觉基础。
- 只使用语义 CSS variables 和 Tailwind utilities，不在业务组件散落原始颜色。

### 2.3 UI primitives 与 Workbench

```text
src/components/ui/
src/features/workbench/Workbench.tsx
src/features/workbench/TopBar.tsx
src/features/workbench/ResizablePanel.tsx
src/features/workbench/EmptyWorkbench.tsx
src/features/workbench/workbenchStore.ts
src/features/workbench/workbenchPersistence.ts
src/features/workbench/*.test.tsx
```

职责：

- 左 Projects、中 Editor、右 Files/Changes、底 Terminal 的固定四区布局。
- panel 折叠、拖动尺寸和按 project 恢复视图状态。
- V1 不加入通用 Dock 框架或递归分屏模型。

### 2.4 生成契约与前端 adapter

```text
src/bindings/generated.ts
src/bindings/index.ts
src/lib/result.ts
src/lib/resourceCache.ts
src/lib/navigationGeneration.ts
src/lib/*.test.ts
```

职责：

- Rust DTO 和 command 是契约权威源，生成 TypeScript bindings。
- 业务 feature 只依赖 bindings/adapter，不直接散落 `invoke`、`listen`。
- resource cache 持有文件正文和 diff，Zustand 只保存 identity/version。
- navigation generation 防止旧异步响应抢焦点。

### 2.5 Projects 前端

```text
src/features/projects/ProjectRail.tsx
src/features/projects/ProjectRow.tsx
src/features/projects/AddProjectButton.tsx
src/features/projects/ProjectContextMenu.tsx
src/features/projects/projectsApi.ts
src/features/projects/projectsStore.ts
src/features/projects/*.test.tsx
```

职责：

- 原生目录选择、recent/open catalog、选择、关闭、Reveal、Copy path。
- 重复打开同一 canonical repo 时复用已有项目。
- 加载、空、错误状态明确区分。

### 2.6 Files 与 Editor 前端

```text
src/features/files/FileTree.tsx
src/features/files/FileTreeRow.tsx
src/features/files/filesApi.ts
src/features/files/fileTreeStore.ts
src/features/files/*.test.tsx
src/features/editor/EditorTabs.tsx
src/features/editor/FilePane.tsx
src/features/editor/MonacoEditor.tsx
src/features/editor/openResource.ts
src/features/editor/editorStore.ts
src/features/editor/*.test.tsx
```

职责：

- 目录懒加载、目录优先排序、展开状态和 watcher invalidation。
- preview/keep tab、稳定 resource identity、并发请求合并和过期导航保护。
- Monaco 懒加载、只读文本展示、大文件/二进制/权限/消失错误页面。

### 2.7 Git Changes 前端

```text
src/features/changes/ChangesPanel.tsx
src/features/changes/ChangesList.tsx
src/features/changes/ChangesTree.tsx
src/features/changes/DiffPane.tsx
src/features/changes/MonacoDiff.tsx
src/features/changes/changesApi.ts
src/features/changes/changesStore.ts
src/features/changes/changesModel.ts
src/features/changes/*.test.tsx
```

职责：

- staged、unstaged、untracked 状态分组和 list/tree 切换。
- 单击 preview diff、双击 keep、unified/split 模式。
- refresh 失败保留 last-known-good，并显示 stale error。

### 2.8 Terminal 前端

```text
src/features/terminal/TerminalPanel.tsx
src/features/terminal/TerminalTabs.tsx
src/features/terminal/TerminalInstance.tsx
src/features/terminal/terminalApi.ts
src/features/terminal/terminalStore.ts
src/features/terminal/useTerminalChannel.ts
src/features/terminal/*.test.tsx
```

职责：

- xterm.js 懒加载，output 直接写对应实例，不经过 Zustand。
- 多 tab、create/write/resize/close、fit debounce、IME 和复制粘贴。
- shell exit/error 状态与 busy close 确认。

### 2.9 Tauri 基础与配置

```text
src-tauri/Cargo.toml
src-tauri/Cargo.lock
src-tauri/build.rs
src-tauri/tauri.conf.json
src-tauri/capabilities/default.json
src-tauri/icons/*
src-tauri/src/main.rs
src-tauri/src/lib.rs
src-tauri/src/app_state.rs
src-tauri/src/error.rs
src-tauri/src/contracts.rs
```

职责：

- 初始化 Tauri、受限 capabilities、应用状态、日志和 command 注册。
- 定义 serde/Specta DTO、统一错误结构与 TypeScript 生成测试。
- 默认产品名 `Pi App`、开发 bundle id `com.bytedance.pi-app.dev`、macOS 13+。

### 2.10 Rust Projects 与持久化

```text
src-tauri/src/projects/mod.rs
src-tauri/src/projects/model.rs
src-tauri/src/projects/service.rs
src-tauri/src/projects/commands.rs
src-tauri/src/projects/tests.rs
src-tauri/src/persistence/mod.rs
src-tauri/src/persistence/atomic_json.rs
src-tauri/src/persistence/tests.rs
```

职责：

- 目录选择后通过 Git 确认 repo root，canonicalize、去重和持久 UUID。
- project list/open/close/reveal/copy-path commands。
- 版本化 JSON，临时文件 + flush + rename 原子替换；损坏状态备份和明确报告。

### 2.11 Rust Files 与 Watcher

```text
src-tauri/src/filesystem/mod.rs
src-tauri/src/filesystem/path_guard.rs
src-tauri/src/filesystem/reader.rs
src-tauri/src/filesystem/watcher.rs
src-tauri/src/filesystem/commands.rs
src-tauri/src/filesystem/tests.rs
```

职责：

- `projectId + relativePath` 访问模型。
- 拒绝 absolute、parent traversal、`.git` 和 symlink escape。
- 异步目录/文本读取、5 MiB 上限、binary/UTF-8 判断。
- 每活动项目单 watcher，debounce/merge/truncated event 和生命周期回收。

### 2.12 Rust Git

```text
src-tauri/src/git/mod.rs
src-tauri/src/git/command.rs
src-tauri/src/git/porcelain.rs
src-tauri/src/git/diff.rs
src-tauri/src/git/worker.rs
src-tauri/src/git/commands.rs
src-tauri/src/git/tests.rs
src-tauri/tests/fixtures/git/*
```

职责：

- 系统 Git 安全参数、超时、进程终止和结构化错误。
- porcelain v2 `-z` parser、status snapshot、diff sides 和 untracked 文件处理。
- 每项目串行 worker；refresh 合并而不并发争用。

### 2.13 Rust Terminal

```text
src-tauri/src/terminal/mod.rs
src-tauri/src/terminal/model.rs
src-tauri/src/terminal/registry.rs
src-tauri/src/terminal/pty.rs
src-tauri/src/terminal/commands.rs
src-tauri/src/terminal/tests.rs
```

职责：

- `portable-pty` shell 创建、cwd/env、reader task、channel output batching。
- session registry、顺序写入、resize 参数校验、exit cleanup。
- busy 状态尽力探测，普通关闭和 force close 分离。
- project close/application exit 时回收所有 child。

### 2.14 测试和 artifact 验证

```text
vitest.config.ts
src/test/setup.ts
src/test/fixtures.ts
scripts/smoke-app.sh
scripts/smoke-dmg.sh
```

职责：

- React/Vitest 组件和状态测试。
- Rust 单元/集成测试。
- 验证 `.app` 目录结构、Info.plist、架构、签名状态和可启动性。
- 验证 DMG 可挂载、包含应用和 `/Applications` 链接。

## 3. Order of work

### Phase 0 — 环境和最小闭环

1. 安装/确认 Node、pnpm、Rust、Tauri prerequisites；记录版本。
2. 建立 `AGENTS.md`、Cargo/npm lockfiles、统一 check 命令。
3. 初始化 Tauri 2 + React + TypeScript + Vite。
4. 设置最小 capabilities 和 CSP。
5. 创建一个仅显示 shell layout 的 WKWebView 窗口。
6. 运行前端测试、Rust 测试、Tauri dev/build smoke。

退出条件：空工作台可作为原生 macOS `.app` 启动，完整 check 命令通过。

### Phase 1 — UI shell 和契约

1. 建立语义主题、UI primitives 和四区 Workbench。
2. 实现 panel resize/collapse 和本地视图持久化 adapter。
3. 建立 Rust error/DTO、Specta TypeScript 生成和 drift check。
4. 建立 feature adapter、resource cache、navigation generation。
5. 为布局恢复和过期导航写前端测试。

退出条件：静态工作台交互完整，契约可生成且 CI 可检测漂移。

### Phase 2 — Projects 纵向切片

1. 先写 project canonicalization、去重、原子 JSON 的 Rust 测试。
2. 实现 project service 和窄化 commands。
3. 接入 Tauri 原生目录选择、Reveal 和 clipboard。
4. 实现 Project rail、recent/open/close/selection。
5. 验证重启恢复、非 Git 错误和重复打开。

退出条件：可打开真实 Git repo，重启后恢复且不重复。

### Phase 3 — Files 和只读 Editor

1. 先写 path traversal、symlink escape、`.git`、大文件和 binary 测试。
2. 实现安全 path guard、目录/文件读取。
3. 实现 watcher debounce、truncated invalidation 和 lifecycle。
4. 实现文件树懒加载和错误状态。
5. 接入 Monaco 只读 viewer。
6. 实现 preview/keep、请求合并、过期响应保护。
7. 用外部命令修改/删除文件验证 watcher 和 viewer 行为。

退出条件：真实 repo 文件可安全浏览，外部修改及时刷新，越界读取被拒绝。

### Phase 4 — Git Changes

1. 创建真实临时 Git fixture，先写 porcelain parser 和状态矩阵测试。
2. 实现受限 Git runner、deadline 和结构化错误。
3. 实现 status、staged/unstaged/untracked diff 和 diff stat。
4. 实现串行 worker 和 watcher-triggered refresh。
5. 实现 Changes list/tree、stale-error、Monaco unified/split diff。
6. 对照系统 Git 命令验证状态与 diff。

退出条件：fixture 和真实 repo 的 status/diff 与 Git 基准一致，失败不会伪装 clean。

### Phase 5 — Terminal

1. 先写 terminal registry、resize validation、close cleanup 测试。
2. 实现 PTY 创建、默认 shell、project cwd 和 reader task。
3. 实现 Tauri Channel output batching、write/resize/close commands。
4. 接入 xterm.js、FitAddon、主题、输入法和复制粘贴。
5. 实现多 tab、shell exit、busy close/force close。
6. 检查关闭 terminal/project/app 后无遗留 child。

退出条件：`pwd`、ANSI color、交互式命令、`Ctrl+C`、resize、多 tab 均通过 smoke。

### Phase 6 — 打包与最终验证

1. 添加开发图标和最终 Tauri bundle metadata。
2. 构建 Apple Silicon release `.app` 和 `.dmg`。
3. 执行 app bundle、Info.plist、架构、签名和 DMG smoke。
4. 将应用复制到 `/Applications` 后启动验证。
5. 完整运行 `pnpm check` 和 production build。
6. 审查完整 diff，删除未使用抽象、依赖、注释、suppression 和重复派生。
7. 更新 README、AGENTS.md 健康命令及已知限制。

退出条件：所有验收标准满足；未完成项必须明确记录，不能用空实现冒充完成。

## 4. Testing strategy

### 4.1 Rust deterministic tests

- Projects：canonical root、重复打开、close/reopen、损坏 JSON、原子替换。
- Files：合法路径、`..`、absolute、symlink 内/外、`.git`、UTF-8、binary、5 MiB 边界。
- Watcher：debounce、合并、truncated、project close cleanup。
- Git：porcelain v2 各状态、rename、空格/非 ASCII 路径、staged+unstaged、untracked、timeout、退出码。
- Terminal：registry、非法尺寸、write-after-close、exit cleanup、project cleanup。

### 4.2 Frontend tests

- Projects loading/empty/error/reopen。
- 文件树懒加载和 watcher invalidation。
- preview 被替换、double-click keep、同 resource 去重。
- 慢请求不能抢当前焦点。
- Git stale snapshot 和 error UI。
- terminal output 直接进入 xterm adapter，不触发 store body 更新。
- project 切换恢复各自 view state。

### 4.3 Integration and manual smoke

- Tauri command serialization 与生成 TypeScript 类型一致。
- 打开包含空格、中文和 symlink 的临时 repo。
- 外部修改文件后 Files/Changes 刷新。
- Terminal 运行 `pwd`、彩色命令、长输出、`sleep` + `Ctrl+C`。
- 挂载 DMG、复制 app、启动、重新打开项目。

## 5. Proof

完成时必须提供以下命令的实际结果：

```bash
pnpm install --frozen-lockfile
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test --run
cargo fmt --manifest-path src-tauri/Cargo.toml --all --check
cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings
cargo test --manifest-path src-tauri/Cargo.toml
pnpm bundle
./scripts/smoke-app.sh
./scripts/smoke-dmg.sh
pnpm check
```

UI 交付额外提供主要页面截图：空状态、已打开项目、文件 viewer、Git diff、Terminal。

## 6. Risks

### 6.1 最大风险：PTY 生命周期与 Tauri 高频 IPC

危险点：reader task 泄漏、child 未清理、逐字节事件拖慢 WebView、Channel 在组件卸载后继续写。

控制方式：专用 channel、4–8ms output batching、registry owner、显式 cancellation、project/app teardown 测试。Terminal 安排在其他纵向切片稳定之后实现。

### 6.2 路径边界与 symlink escape

危险点：只做字符串/词法校验会允许项目内 symlink 读取项目外内容。

控制方式：Rust command 只接受 relative path；canonicalize 后验证 containment；在真实 symlink fixture 上测试。所有文件和 untracked diff 共用同一个 path guard。

### 6.3 Git 输出和大 diff

危险点：路径包含换行/非 ASCII、submodule、rename 和大 untracked 文件导致 parser 或内存错误。

控制方式：使用 porcelain v2 `-z`；fixture 覆盖特殊路径；统一大小限制；Git worker 设置 deadline；前端不把完整 diff 放入 Zustand。

### 6.4 WKWebView、Monaco 和 xterm.js

危险点：IME、快捷键、字体、ResizeObserver 和 WebView CSP 兼容问题。

控制方式：在 Phase 0 验证动态资源加载，在 Files/Terminal 阶段分别做真实 WKWebView smoke；不等最终打包才测试。

### 6.5 签名与公开分发

危险点：当前机器无 Developer ID identity，无法完成正式 notarization。

控制方式：V1 只承诺本地 ad-hoc `.app/.dmg`；不把产物描述为可公开分发。正式签名作为凭据到位后的独立变更。

### 6.6 工具链和磁盘

危险点：首次安装前端、Rust 和 Tauri 依赖占用较大，当前磁盘空间有限。

控制方式：不再需要 GPUI Metal Toolchain；实现前记录可用空间；不构建无关 target；按阶段清理不再使用的中间方案。

## 7. Rejected alternatives

### GPUI

放弃原因：需要自行承担成熟 editor、terminal renderer、IME、accessibility 和快速变化的 GPUI API；不符合当前“UI 参考 ThinkRail、复用系统 WebView”的确认方向。

### Electrobun/Bun server

放弃原因：后端必须使用 Tauri/Rust；本地同进程能力无需再引入 HTTP/WebSocket server。

### Electron

放弃原因：会内置 Chromium，不符合复用系统 WebView 的约束。

### 直接复制 ThinkRail 前端

放弃原因：ThinkRail store、wire、workspace/chat/layout 与当前边界高度耦合，直接复制会带入无关复杂度；只复用信息架构和经验证的产品行为。

### 首版完整文件编辑器

放弃原因：dirty buffer、保存冲突、编码/EOL、undo、watcher reconciliation 是独立交付目标。V1 使用 Monaco read-only，与 ThinkRail 当前 Files 能力一致。

## 8. Approval boundary

本计划获批后才开始创建脚手架和应用代码。实施允许在不改变产品范围和架构边界的前提下调整生成文件名；任何新增业务范围、通用 Dock、文件写入、Git mutation 或 Chat 都需要先更新 `intent.md`、`spec.md` 和本计划。
