# Plan: 设置中心与 Extensions 管理（from docs/settings-and-extensions/spec.md 2026-09-15）

## Files that change

- `docs/settings-and-extensions/{intent,spec,plan}.md`：记录已批准需求、设计与实现计划。
- `electron/domains/settings/*`：扩展发现、去重、开关覆盖持久化与测试。
- `electron/{contracts,ipc,appState}.ts` 及测试：增加最小类型化 IPC surface。
- `src/bindings/{generated,index}.ts`：增加 extension catalog DTO 与调用封装。
- `src/features/settings/*`：设置模态框、Extensions 页面、API 和组件测试。
- `src/features/workbench/{Workbench,Workbench.test}.tsx`：右上角入口与集成测试。
- `src/styles/index.css`：设置模态框、导航、扩展列表和开关样式。
- `electron/domains/chat/piAdapter.ts` 及测试（仅当 SDK 可安全注入过滤）：新会话应用禁用项。

## Order of work

1. 阅读当前固定版本 Pi SDK 的 ResourceLoader、SettingsManager 与 package filtering 实现，确定宿主可用接口。
2. 先实现并测试 Main 的 extension catalog：扫描四个约定目录、读取两级 settings 配置、规范化、去重、生成稳定 ID。
3. 实现原子持久化的开关覆盖，以及 list/set IPC；校验 `worktreeId`、extension ID 和额外参数。
4. 若 Pi SDK 提供稳定过滤入口，在 Agent session 创建边界注入启用列表；否则保留明确的 pending/new-session 状态，不修改 Pi 用户配置。
5. 实现设置按钮、模态框分类和 Extensions 列表交互，补齐 loading/error/empty/pending 状态。
6. 运行相关测试、格式化检查和 `pnpm check`。

## Risks

- 最危险的是把 UI 开关误实现为直接编辑或重命名 Pi 用户文件，可能破坏 CLI 配置；因此使用 SpireCode 自有覆盖层，并只在 Agent 创建边界过滤。
- Extension 路径可能是 symlink 或 settings 中的任意绝对路径；Renderer 不接收可操作路径，项目目录扫描拒绝 symlink escape。
- Pi packages 的资源清单与过滤语义复杂；优先复用固定 SDK 的解析结果/API，不复制完整 package manager。
- 不采用启动独立 `pi config` TUI 或 shell 命令，因为它不适合 Renderer、难以类型化且会引入命令注入和状态竞态。

## Proof

- Settings domain 单元测试覆盖四种目录来源、settings 来源、去重、持久化、非法 ID 和 symlink escape。
- IPC 测试覆盖命令 allowlist 与参数验证。
- Renderer 测试覆盖打开/关闭、分类切换、catalog 渲染和开关调用。
- `pnpm check` 全量通过。
