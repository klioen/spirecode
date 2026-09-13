# Spec: 基于 Tauri 的 pi-app macOS 客户端
Status: draft。 Implements: `docs/pi-app/intent.md`。

## 1. 产品范围

### 1.1 V1 包含

1. Projects
   - 使用系统目录选择器打开本地目录。
   - 定位并验证 Git repository root。
   - 展示最近项目、切换项目、关闭项目、复制路径、在 Finder 中显示。
   - 重启应用后恢复 project catalog 和上次活动项目。
2. Files
   - 目录懒加载，目录优先排序，隐藏 `.git`。
   - 尊重常见 ignore 规则，监听文件系统变化。
   - 单击打开 preview tab，双击固定 tab。
   - 使用 Monaco 只读展示 UTF-8 文本；对二进制、超大、消失、无权限文件显示明确状态。
3. Git Changes
   - 展示 staged、unstaged、untracked 文件及增删统计。
   - 支持 list/tree 视图和单文件 unified/split diff。
   - 支持手动刷新和文件变化后的 debounce refresh。
   - 刷新失败时保留 last-known-good snapshot 并展示错误。
4. Terminal
   - 使用 xterm.js 展示由 Rust PTY 驱动的真实交互式 shell。
   - 支持多 tab、输入输出、ANSI、resize、scrollback、复制粘贴、IME 和关闭。
   - shell cwd 为当前 project root。
5. Desktop artifact
   - Apple Silicon macOS `.app` 和 `.dmg`。
   - 应用可拖入 `/Applications` 后启动。

### 1.2 V1 不包含

- Chat 或 pi agent 集成。
- 文件编辑、保存、autosave、dirty buffer、冲突处理。
- Tree-sitter、LSP、DAP、代码补全。
- stage、unstage、discard、commit、push、pull、branch mutation、Git graph。
- ThinkRail 的 managed workspace / `git worktree` 层。
- 任意 Dock、递归分屏、多窗口状态同步。
- 远程 host、WebSocket server、浏览器部署。
- Windows/Linux 发布产物。

## 2. 技术栈

| 层 | 技术 |
|---|---|
| Desktop | Tauri 2，macOS WKWebView |
| Backend | Rust stable，Tokio async runtime |
| Frontend | React 19、TypeScript、Vite |
| State | Zustand，按业务 slice 分离 |
| Styling | Tailwind CSS v4、CSS variables |
| Components | Radix UI / shadcn-style owned components |
| Icons | Remix Icon |
| Source viewer | Monaco Editor |
| Diff viewer | Monaco Diff Editor |
| Terminal UI | xterm.js |
| PTY | `portable-pty` |
| File watch | `notify` |
| Ignore rules | `ignore` crate |
| Git | 系统 Git CLI，由 Rust 管理 |
| Contract generation | Rust serde DTO + Specta 生成 TypeScript |
| Persistence | Rust 原子 JSON 写入；单进程所有权 |
| Packaging | Tauri `.app` / `.dmg` |

依赖必须固定精确版本并提交 lockfiles。新增依赖前优先使用 Tauri、Rust 标准库或既有依赖能力。

## 3. 系统架构

```text
React UI in WKWebView
  ├─ projects feature
  ├─ files feature + Monaco
  ├─ changes feature + Monaco Diff
  ├─ terminal feature + xterm.js
  └─ workbench layout
          │
          ├─ invoke: request/response
          ├─ Channel: terminal stream
          └─ event: low-frequency invalidation
          │
Rust Tauri backend
  ├─ project catalog + persistence
  ├─ project-scoped filesystem access + watcher
  ├─ serialized Git workers + snapshots
  └─ PTY session registry
```

### 3.1 状态所有权

Rust 后端拥有领域事实：

- project catalog 和 canonical roots；
- filesystem watcher 生命周期；
- Git snapshot 和运行中的 Git jobs；
- PTY session 和 shell process；
- durable application state。

React 前端拥有窗口视图状态：

- 当前 project selection；
- project/files 展开状态；
- 打开的 file/diff tabs、顺序、preview identity；
- Files/Changes 当前模式；
- panel 大小、折叠状态；
- Monaco/xterm 视图实例。

完整文件内容和 diff 文本由独立 resource cache 持有，不进入全局 Zustand store。

### 3.2 模块边界

```text
src/
  app/             application composition
  components/ui/   owned reusable UI primitives
  features/
    projects/
    files/
    editor/
    changes/
    terminal/
    workbench/
  bindings/        generated Tauri commands and DTOs
  stores/          small view-state stores
  styles/

src-tauri/src/
  app_state.rs
  commands/
  projects/
  filesystem/
  git/
  terminal/
  persistence/
  error.rs
```

业务 feature 不直接调用原始 `invoke` 或 `listen`；统一通过生成 bindings 和 feature adapter。Rust command 只负责参数校验与委派，领域逻辑位于对应模块。

## 4. UI 与交互

默认布局：

```text
Top bar: active project / branch / global actions
Left:    Projects
Center:  file and diff tabs + Monaco viewer
Right:   Files / Changes switcher
Bottom:  Terminal tabs
```

- 左、右、底部 panel 可折叠并可调整尺寸。
- V1 不支持把资源拖到任意区域。
- 当前 project 切换时，恢复该 project 的文件 tabs、diff tabs、展开目录和活动 terminal tab。
- Project catalog 是领域状态；工作台状态按 project 在当前窗口本地保存。

### 4.1 Preview tab

- 文件或 change 单击：打开/替换一个 preview tab。
- 双击：固定为普通 tab。
- 相同 resource identity 不重复打开。
- resource identity：
  - file: `(projectId, relativePath)`；
  - diff: `(projectId, diffScope, relativePath)`。
- 异步读取必须携带 navigation generation；旧响应可填充缓存，但不能抢回当前焦点。

## 5. Tauri 接口

### 5.1 Commands

初始接口：

```text
project_list
project_open_dialog
project_open_path
project_close
project_reveal
project_copy_path

fs_read_dir
fs_read_file

git_status
git_diff_file

terminal_create
terminal_write
terminal_resize
terminal_close
terminal_list
```

所有 command 返回生成的 typed result。业务错误使用统一结构：

```text
CommandError {
  code,
  message,
  details?
}
```

最低错误码：

```text
NOT_FOUND
PERMISSION_DENIED
OUTSIDE_PROJECT
NOT_A_GIT_REPOSITORY
UNSUPPORTED_FILE
FILE_TOO_LARGE
GIT_FAILED
GIT_TIMED_OUT
TERMINAL_NOT_FOUND
TERMINAL_FAILED
INVALID_ARGUMENT
```

### 5.2 Channel

`terminal_create` 接收专用 Channel，消息类型：

```text
output { terminalId, data }
exit   { terminalId, exitCode? }
error  { terminalId, error }
```

- PTY 输出按短时间窗口批量发送，避免逐字节 IPC。
- 一个 terminal channel 只承载该 terminal 的流量。
- terminal input 和 resize 仍使用 command；同一 terminal 的 write 保序。

### 5.3 Events

低频 invalidation：

```text
filesystem://changed { projectId, paths, truncated }
git://changed        { projectId }
project://updated    { project }
```

前端采用 subscribe-before-read。事件只表示 snapshot 失效，不作为唯一领域事实；收到事件后通过 command 重读。每次读取带 generation，旧 read 不覆盖较新的 event/read。

## 6. Projects

- 用户选择任意目录后，Rust 执行 `git rev-parse --show-toplevel` 确定 repository root。
- canonical root 是 project 的权限边界和稳定去重键。
- 同一 canonical root reopen 时复用 project id 并更新 `lastOpenedAt`。
- Close 只从 active catalog 移除，不删除磁盘目录。
- Project ID 使用持久 UUID，不从可变路径或名称临时推导。
- Project 持久化采用写临时文件、flush、rename 的原子替换流程。

## 7. Files

### 7.1 路径安全

前端只能提交 `projectId + relativePath`。

每次访问：

1. 通过 `projectId` 获取已登记 canonical root；
2. 拒绝 absolute path、`..` 和非法 path component；
3. canonicalize 目标或最近存在的父目录；
4. 验证真实路径仍位于 canonical root；
5. 对 symlink 目标重复执行 containment；
6. 拒绝 `.git` 内容读取。

不能仅使用字符串前缀或词法 `join/normalize` 判断 containment。

### 7.2 读取策略

- `fs_read_dir` 异步执行，目录优先、名称自然排序。
- 不返回 `.git`；使用 `ignore` 规则决定默认可见项。
- `fs_read_file` 先检查 metadata 和最大体积，再读取。
- V1 默认文本上限 5 MiB；阈值成为常量并由测试固定。
- 包含 NUL 或无法按 UTF-8 解码时返回 `UNSUPPORTED_FILE`。
- 不把 read error 映射为空目录或空文件。

### 7.3 Watcher

- 每个活动 project 最多一个 watcher。
- 事件 debounce 后合并；路径过多时设置 `truncated`，前端执行全量失效。
- 忽略 `.git` 内部噪音，但 Git 状态需通过独立 debounce 刷新。
- project close 或应用退出时停止 watcher。

## 8. Git Changes

- 每个 project 使用串行 Git worker，避免 index 和 refresh 竞争。
- 命令通过参数数组调用，不使用 shell command string。
- 所有 Git 命令设置超时并杀死超时 child。
- 不可信 project 默认使用：

```text
-c core.hooksPath=/dev/null
-c credential.helper=
-c protocol.ext.allow=never
-c diff.external=
--no-ext-diff
```

- Status 基于 machine-readable `--porcelain=v2 -z` 输出。
- Diff scope V1：
  - working tree：staged + unstaged + untracked 状态；
  - staged diff；
  - unstaged diff。
- Untracked 文件 diff 由 Rust 安全读取并构造 empty-to-content sides，仍受文件体积和二进制限制。
- 前端保留 last-known-good snapshot；失败状态与 empty state 明确区分。

## 9. Terminal

- 每个 Terminal tab 对应一个后端 PTY session。
- `portable-pty` 创建用户默认 shell；macOS 优先读取 `$SHELL`，无效时回退 `/bin/zsh`。
- shell cwd 必须是对应 canonical project root。
- 前端 xterm.js 负责 VT/ANSI 解析和 DOM 渲染，Rust 不维护字符网格。
- resize 验证 `cols`/`rows` 在合理范围内并 debounce。
- 应用退出、project close 或 terminal close 时终止对应 child 并释放 reader task。
- 关闭运行中 terminal 前由后端返回 busy 信息；用户确认后 force close。
- V1 terminal 不跨应用重启恢复进程，只恢复 UI 时创建新 shell。

## 10. 前端状态与性能

- 按 feature 划分 Zustand store，不创建包含所有领域和视图状态的单体 store。
- `ProjectSummary`、tab metadata 可进入 store；file/diff body 进入 resource cache。
- Monaco 和 xterm.js 懒加载。
- 文件树使用目录懒加载；大目录列表需避免一次渲染全部后代。
- Terminal output 直接写入对应 xterm instance，不经过 Zustand。
- 所有 async UI 至少区分 loading、ready、empty、stale-error、fatal-error。

## 11. 安全

- Tauri capabilities 采用 allowlist，只开放 dialog、window 和应用所需的有限能力。
- 不向 WebView 开放通用 filesystem plugin 权限。
- 不向 WebView 开放通用 shell plugin 或 arbitrary command execution。
- CSP 禁止不必要的远程脚本和资源。
- 外部 URL 必须经 Rust 或受限 opener allowlist 打开。
- Project path、file path、Git pathspec、terminal id 在 Rust boundary 验证。
- 日志不得记录文件正文、terminal 输入或环境变量值。

## 12. 持久化

默认目录使用 Tauri app data directory，内容包括：

```text
state.json             project catalog and last active project
workbench.json         per-project local view state
logs/                  bounded application logs
```

- Rust 领域状态由 Rust 写入。
- 纯 UI layout 可由前端通过窄化 command 保存，避免 WebView 任意写文件。
- JSON 使用版本字段；未知新版本拒绝覆盖，旧版本通过显式 migration 处理。
- 写入必须 atomic replace，损坏文件应备份并恢复为空状态，同时向用户报告。

## 13. Packaging

开发默认值：

```text
Product: Pi App
Bundle identifier: com.bytedance.pi-app.dev
Minimum macOS: 13.0
Target: aarch64-apple-darwin
```

- `tauri build` 生成 `.app` 和 `.dmg`。
- 本地验收允许 ad-hoc signing。
- 正式分发签名、notarization 和 updater 不属于 V1，除非提供凭据和发布目标。

## 14. 验收标准

### Projects

- 用户可选择本地 Git 目录，应用显示项目并在重启后恢复。
- 非 Git 目录得到明确错误，不产生残留 project。
- 同一路径重复打开不产生重复项目。

### Files

- 可展开目录并打开 UTF-8 文件。
- 单击 preview、双击固定行为正确。
- project 外路径和 symlink escape 被 Rust 拒绝。
- 文件变化后可见内容与树能够刷新。

### Git

- staged、unstaged、untracked 状态和 diff 与 Git CLI 基准一致。
- Git 失败不会显示为 clean；旧 snapshot 保留并标记 stale。

### Terminal

- 在 project cwd 启动交互式 shell。
- `pwd`、彩色输出、`Ctrl+C`、resize 和多 terminal tab 可用。
- 关闭 terminal 后无遗留 PTY child。

### Artifact

- Apple Silicon `.app` 可启动。
- `.dmg` 可挂载，应用可拖到 `/Applications` 并再次启动。

## 15. 验证门槛

提供统一命令，例如 `pnpm check`，至少串行执行：

```text
frontend format/lint/typecheck/unit tests
cargo fmt --check
cargo clippy --all-targets -- -D warnings
cargo test
Tauri production build
artifact smoke checks
```

关键 Rust 单测覆盖：

- path containment 和 symlink escape；
- project 去重与原子持久化；
- porcelain v2 parser；
- Git timeout/error mapping；
- terminal registry 生命周期。

关键前端测试覆盖：

- preview/keep tabs；
- read/event generation race；
- stale Git snapshot；
- terminal output 不进入 Zustand；
- project switch view restoration。

## 16. Concerns

### Concern A：产品名与 bundle identifier

开发默认值可用于本机安装，但正式发布前需要负责人确认产品名称、bundle identifier 和图标。

### Concern B：签名与 notarization

当前环境没有可用 Developer ID identity。V1 可以验证 ad-hoc `.app/.dmg`，不能把未公证产物表述为可公开分发版本。

### Concern C：Terminal busy detection

跨 shell 精确判断“是否有任务正在运行”并不可靠。V1 可以根据 foreground process/child process 做保守提示，但规格不承诺零误判。

### Concern D：系统 WebView 差异

V1 只验收 macOS WKWebView。未来 Windows WebView2/Linux WebKitGTK 需要分别进行 Monaco、xterm.js、IME、字体和快捷键兼容验证。
