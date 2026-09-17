# Plan: Settings Memory 文档查看（from docs/settings-memory/spec.md 2026-09-16）

## Files that change

- `docs/settings-memory/{intent,spec,plan}.md`：记录需求、设计和获批实现计划。
- `electron/domains/memory/index.ts`：只读 MemoryService，仅映射和读取两个固定文档。
- `electron/domains/memory/memory.test.ts`：覆盖固定 ID、环境变量目录、缺失文件、大小/编码限制和 symlink escape。
- `electron/domains/settings/{index,settings.test}.ts`：持久化、迁移并验证全局 Memory Model 与 Reasoning Effort。
- `electron/{contracts,ipc,appState}.ts`：注册 Memory 文档/模型 allowlist commands、严格参数验证，并在 Pi extension 加载前应用模型环境变量。
- `electron/{contracts,ipc}.test.ts`：覆盖命令契约，证明路径、额外参数和未知 document 被拒绝。
- `src/bindings/{generated,index}.ts`：增加 MemoryDocument/MemoryConfig DTO 与类型化调用封装。
- `src/features/settings/MemorySettings.tsx`：提供两个文档的切换、异步状态、Markdown 阅读、Memory Model 与 Reasoning Effort 配置，并移除 Refresh。
- `src/features/settings/MemorySettings.test.tsx`：覆盖默认读取、切换、无项目、配置加载/保存/验证、错误及请求竞态。
- 上游 `pi-extensions/packages/pi-memory/lib/memory-core.cjs` 及测试：增加 `PI_MEMORY_EXTRACT_THINKING`，用于 Phase 1 `--thinking`，并更新 SpireCode 锁定的依赖 commit。
- `src/features/settings/SettingsDialog.tsx`：增加 Memory 导航并挂载独立组件。
- `src/features/settings/SettingsDialog.test.tsx`：覆盖 Memory 导航与页面切换。
- `src/styles/index.css`：维护文档 tabs、metadata、模型表单及滚动正文样式，删除 Refresh 样式。

## Order of work

1. 先写 MemoryService 和 IPC 的失败测试，固定只允许 `summary` / `handbook`，并验证 Renderer 无法提供路径。
2. 实现 Memory root 解析、固定 ID 映射、普通文件及 canonical containment 校验、2 MiB/UTF-8 限制。
3. 将服务接入 AppState、command allowlist、IPC 参数验证和类型化 Renderer bindings。
4. 先在 pi-extensions 写失败测试，再让 Phase 1 从 `PI_MEMORY_EXTRACT_THINKING` 读取受限 reasoning 值；提交上游改动并更新 SpireCode 的固定依赖 commit。
5. 写 SettingsService 与 IPC 的失败测试，再扩展持久化 schema，增加 config get/set 与输入验证，并在 AppState 启动时设置模型和 reasoning 环境变量。
6. 写 Renderer 失败测试，再实现模型输入、reasoning 选择、保存和重启提示；移除 Refresh 按钮、样式和测试，保留文档切换与错误状态。
7. 分别运行 pi-extensions 与 SpireCode 的格式化、专项测试、typecheck，最后运行 `pnpm check`。

## Risks

- 最危险的是把该功能做成任意 home-directory 文件浏览器；因此 IPC 只接受两个枚举 ID，由 Main 固定映射文件名，永不接收路径。
- `PI_MEMORY_DIR` 可能指向 symlink 或文档本身可能被替换为 symlink；读取前必须 canonicalize 并验证目标仍位于 canonical root 内。
- `MEMORY.md` 可能持续增长；首版设置 2 MiB 上限，避免大正文跨 IPC 阻塞 Renderer。超过限制时明确报错而不是截断，以免用户误以为数据完整。
- Markdown 可能包含链接或 HTML；复用现有 `MarkdownContent` 的安全渲染边界，不新增 HTML 执行或文件 URL 能力。
- 不采用 `fs_read_file` 或 worktree ID，因为 Memory 是全局数据，伪装成 project 文件会破坏现有授权模型。
- 不读取 SQLite 或调用 pi-memory `getDb()`，避免只读页面触发目录创建、schema migration 或 WAL 写入。
- Memory extension 在模块加载时读取模型且 worker 长期运行；不做不可靠的热更新，保存后明确要求重启应用。
- Reasoning 目前在 pi-memory 中固定为 Phase 1 `low`、Phase 2 `medium`；只把 Phase 1 改为受限环境变量，非法输入回退 `low`，避免影响 Phase 2。
- 不覆盖 `PI_MEMORY_PHASE2_MODEL`，避免单一 UI 配置无意改变原有 Phase 2 独立模型语义。

## Proof

- `electron/domains/memory/memory.test.ts` 证明只有两个固定文档可读，缺失/超限/非法编码失败，symlink 不能逃逸。
- `electron/contracts.test.ts` 与 `electron/ipc.test.ts` 证明 command 在 allowlist 内，同时拒绝 path、root、额外字段和未知 document。
- pi-memory 测试证明 Phase 1 使用配置的 reasoning effort、非法值回退 `low`，Phase 2 保持 `medium`。
- SettingsService/IPC 测试证明默认配置、旧 schema 迁移、原子持久化、输入验证及额外字段拒绝。
- `src/features/settings/MemorySettings.test.tsx` 证明默认文档、切换、无项目可用、配置加载/保存、错误状态和旧请求隔离，并证明 Refresh 已移除。
- `src/features/settings/SettingsDialog.test.tsx` 证明导航可达且切换正确。
- 运行相关 Vitest 测试、`pnpm typecheck` 和 `pnpm check`；完整记录与本变更无关的任何基线失败。
