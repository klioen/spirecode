# Plan: Settings Memory 文档查看（from docs/settings-memory/spec.md 2026-09-16）

> [!NOTE]
> 本文保留该功能交付时对 bundled `pi-memory` 上游的历史实施记录。当前 SpireCode 不依赖该仓库；Memory 文档读取仍是本地功能，而后台 memory 执行需要用户通过标准 Pi settings 自行安装并启用兼容资源。

## Files that change

- `docs/settings-memory/{intent,spec,plan}.md`：记录需求、设计和获批实现计划。
- `electron/domains/memory/index.ts`：只读 MemoryService，仅映射和读取两个固定文档。
- `electron/domains/memory/memory.test.ts`：覆盖固定 ID、环境变量目录、缺失文件、大小/编码限制和 symlink escape。
- `electron/domains/settings/{index,settings.test}.ts`：持久化、迁移并验证 Phase 1/Phase 2 各自的 Model 与 Reasoning Effort。
- `electron/domains/models/*` 或等价 Main-only service：无 session 初始化 Pi provider/model runtime，返回全局可用且已认证模型目录。
- `electron/{contracts,ipc,appState}.ts`：注册 Memory 文档/模型目录/配置 allowlist commands、严格参数验证，并在 Pi extension 加载前应用两个阶段各自的模型与 reasoning 环境变量。
- `electron/{contracts,ipc}.test.ts`：覆盖命令契约，证明路径、额外参数和未知 document 被拒绝。
- `src/bindings/{generated,index}.ts`：增加 MemoryDocument/MemoryConfig DTO 与类型化调用封装。
- `src/features/settings/MemorySettings.tsx`：提供两个文档的切换、异步状态、Markdown 阅读，以及 Phase 1/Phase 2 各自的 Model 与 Reasoning Effort 下拉，并移除 Refresh；Save 使用低强调次级样式。
- `src/features/settings/MemorySettings.test.tsx`：覆盖模型目录加载、provider 分组、Unavailable 兼容项、默认读取、切换、无项目、双模型配置加载/保存/迁移/验证、错误、按钮样式及请求竞态。
- 上游 `pi-extensions/packages/memory/lib/memory-core.cjs` 及测试：支持 `PI_MEMORY_EXTRACT_THINKING` 和 `PI_MEMORY_PHASE2_THINKING`，分别用于两个阶段的 `--thinking`，并更新 SpireCode 锁定的依赖 commit。
- `src/features/settings/SettingsDialog.tsx`：增加 Memory 导航并挂载独立组件。
- `src/features/settings/SettingsDialog.test.tsx`：覆盖 Memory 导航与页面切换。
- `src/styles/index.css`：维护文档 tabs、metadata、模型表单及滚动正文样式，删除 Refresh 样式。

## Order of work

1. 先写 MemoryService 和 IPC 的失败测试，固定只允许 `summary` / `handbook`，并验证 Renderer 无法提供路径。
2. 实现 Memory root 解析、固定 ID 映射、普通文件及 canonical containment 校验、2 MiB/UTF-8 限制。
3. 将服务接入 AppState、command allowlist、IPC 参数验证和类型化 Renderer bindings。
4. 在 pi-extensions 用失败测试锁定两个阶段的 reasoning 行为：Phase 1 从 `PI_MEMORY_EXTRACT_THINKING` 读取且默认 `low`，Phase 2 从 `PI_MEMORY_PHASE2_THINKING` 读取且默认 `medium`；提交上游改动并更新 SpireCode 固定依赖。
5. 先写全局模型目录失败测试，再从 Chat adapter 提取 provider/runtime 初始化与模型 DTO 映射，新增无 worktree/session 的 `settings_memory_models_list`；禁止创建隐藏 session，并排除 project-only provider。
6. 写 SettingsService 与 IPC 的失败测试，再升级持久化 schema，将旧单模型/单 reasoning 配置迁移为两个阶段各自的 Model 与 Reasoning Effort；保存前用最新目录验证两个模型，并在 AppState 启动时注入四项配置。
7. 写 Renderer 失败测试，再实现两个按 provider 分组的模型下拉、Unavailable 兼容项、两个独立 reasoning 下拉、保存和重启提示；Save 调整为低强调次级按钮，保留文档切换与错误状态。
8. 分别运行 pi-extensions 与 SpireCode 的格式化、专项测试、typecheck，最后运行 `pnpm check`。

## Risks

- 最危险的是把该功能做成任意 home-directory 文件浏览器；因此 IPC 只接受两个枚举 ID，由 Main 固定映射文件名，永不接收路径。
- `PI_MEMORY_DIR` 可能指向 symlink 或文档本身可能被替换为 symlink；读取前必须 canonicalize 并验证目标仍位于 canonical root 内。
- `MEMORY.md` 可能持续增长；首版设置 2 MiB 上限，避免大正文跨 IPC 阻塞 Renderer。超过限制时明确报错而不是截断，以免用户误以为数据完整。
- Markdown 可能包含链接或 HTML；复用现有 `MarkdownContent` 的安全渲染边界，不新增 HTML 执行或文件 URL 能力。
- 不采用 `fs_read_file` 或 worktree ID，因为 Memory 是全局数据，伪装成 project 文件会破坏现有授权模型。
- 不读取 SQLite 或调用 pi-memory `getDb()`，避免只读页面触发目录创建、schema migration 或 WAL 写入。
- Memory extension 在模块加载时读取模型且 worker 长期运行；不做不可靠的热更新，保存后明确要求重启应用。
- Reasoning 默认保持 Phase 1 `low`、Phase 2 `medium`；两个环境变量都使用严格 allowlist，非法值分别回退到各自默认值。
- Phase 2 Model 已由 pi-memory 原生支持 `PI_MEMORY_PHASE2_MODEL`；SpireCode 仅负责持久化与启动前注入，不修改上游执行逻辑。
- 不能复用 `chat_session_config`，因为它要求有效 worktree 和已注册 session；也不能创建隐藏 session污染历史。全局目录必须独立于项目，并复用相同 provider/runtime 初始化逻辑。
- Renderer 下拉不是安全边界；Main 保存时必须重新验证模型仍在可用目录。

## Proof

- `electron/domains/memory/memory.test.ts` 证明只有两个固定文档可读，缺失/超限/非法编码失败，symlink 不能逃逸。
- `electron/contracts.test.ts` 与 `electron/ipc.test.ts` 证明 command 在 allowlist 内，同时拒绝 path、root、额外字段和未知 document。
- pi-memory 测试证明两个阶段分别使用配置的 reasoning effort，非法值分别回退 `low` / `medium`。
- 模型目录测试证明无项目/session 也能列出已认证模型，不创建 session，不包含 project-only provider，且返回严格 DTO。
- SettingsService/IPC 测试证明四项默认配置、旧单模型/单 reasoning schema 迁移、目录内模型校验、原子持久化、输入验证及额外字段拒绝。
- AppState 测试证明 Phase 1/Phase 2 的 Model 和 Reasoning Effort 均在 extension 加载前注入环境。
- `src/features/settings/MemorySettings.test.tsx` 证明按 provider 分组下拉、Unavailable 兼容项、空目录/错误、默认文档、切换、无项目可用、双模型配置加载/保存、错误状态、低强调 Save 和旧请求隔离，并证明 Refresh 已移除。
- `src/features/settings/SettingsDialog.test.tsx` 证明导航可达且切换正确。
- 运行相关 Vitest 测试、`pnpm typecheck` 和 `pnpm check`；完整记录与本变更无关的任何基线失败。
