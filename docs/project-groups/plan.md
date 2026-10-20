# Plan: Projects 项目分组
Status: completed。 From: `docs/project-groups/spec.md`。

## Files expected to change

- `docs/project-groups/{intent,spec,plan}.md`：需求、规格、风险与证明。
- `electron/domains/projects/index.ts`：v4 catalog、v1/v2/v3 迁移、Group CRUD 与项目归组事务。
- `electron/domains/projects/projects.test.ts`：迁移、结构校验、事务与重启持久化测试。
- `electron/contracts.ts`、`electron/ipc.ts`、`electron/ipc.test.ts`：四个窄命令及 nullable groupId 参数边界。
- `src/bindings/generated.ts`、`src/bindings/index.ts`：分组类型与 Renderer 命令。
- `src/features/projects/projectsApi.ts`、`src/features/projects/projectsStore.ts` 及测试：权威 catalog 接入。
- `src/features/projects/ProjectGroupDialog.tsx` 及测试：创建、重命名、删除、移动对话框。
- `src/features/projects/ProjectRail.tsx`、`ProjectRail.test.tsx`：三级展示、组折叠、菜单与状态。
- `src/i18n/en.ts`、`src/i18n/zh-CN.ts`：双语文案。
- `src/styles/index.css`：分组层级、菜单、对话框和 focus 样式。
- 其他构造 `ProjectSummary` fixture 的测试文件：补必需 `groupId`，不改变测试语义。

## Order of work

1. 先补 ProjectService 的 v3 → v4 迁移和 Group CRUD/归组失败测试，确认未实现时按预期失败。
2. 实现 v4 类型、严格 parser、旧版本迁移和基于 `transact()` 的四个分组操作；保证删除分组只解除归属。
3. 更新现有迁移与 Project 行为测试，证明重新打开、directory → git、关闭项目不破坏分组语义。
4. 先补 IPC 参数测试，再加入 contracts、invoke 分发、nullable groupId 窄校验和 Renderer bindings。
5. 扩展 Projects store 与 API；所有分组 mutation 使用 Main 返回的完整 catalog 调用 `setCatalog()`。
6. 先补对话框和 ProjectRail 测试，再实现创建/重命名/删除/移动，以及“分组 → 项目 → worktree”展示。
7. 加入双语文案和样式，检查窄侧栏 ellipsis、键盘操作、焦点与 session spinner。
8. 运行针对性测试、格式/lint/typecheck，再运行完整 `pnpm check`；偏离规格时同步更新本文档。

## Risks and mitigations

- **持久化降级不兼容**：v4 写入后旧 v3 应用不能读取。实施前明确确认；迁移测试证明升级不丢 Project/Worktree/active ID。
- **迁移遗漏**：v1/v2/v3/version 0 走不同路径。每条路径均使用真实 JSON fixture 并验证磁盘回写。
- **悬空归属或重复组**：当前版本 parser 和 mutation 同时验证 UUID、唯一名称及 groupId 外键。
- **Main/Renderer contract 漂移**：同步更新 bindings，并由 typecheck 与 IPC 测试约束命令名和 payload。
- **删除误伤项目**：删除组只在一个 catalog 事务内把 `groupId` 置 null；Renderer 测试断言不调用 project close、Chat 清理或资源停止。
- **三级折叠交互混淆**：分组与项目使用独立 button、独立 `aria-expanded` 和独立状态集合；测试两层组合行为。
- **ProjectRail 复杂度增长**：表单/确认逻辑放在独立 `ProjectGroupDialog.tsx`，Rail 只负责展示和编排。

## Verification commands

```bash
pnpm test -- electron/domains/projects/projects.test.ts electron/ipc.test.ts src/features/projects/projectsStore.test.ts src/features/projects/ProjectGroupDialog.test.tsx src/features/projects/ProjectRail.test.tsx
pnpm format:check
pnpm lint
pnpm typecheck
pnpm check
```

## Verification result

用户已确认高风险门禁，功能按本计划完成。`pnpm check` 全量通过：format、brand、i18n、secrets、licenses、lint、Renderer/Electron typecheck、72 个 Vitest 文件共 497 个测试，以及 18 个 release 测试均通过。

实施期间发现主分支已有 `ExtensionsSettings.tsx` 中裸 `npm` 文案会触发 localized-copy gate；将其接入双语 catalog 后门禁恢复通过，不改变显示内容。
