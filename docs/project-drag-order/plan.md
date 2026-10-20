# Plan: Projects 拖拽移动与排序

Status: implemented。 From: `docs/project-drag-order/spec.md`。

## Risk gate

这是持久化 schema 与 IPC contract 变更，判定为高风险。用户已在实施编码、依赖写入和 v5 状态落盘前明确确认。

## Files expected to change

- `docs/project-drag-order/{intent,spec,plan}.md`：决策、REA 证据、规格、风险和证明。
- `electron/domains/projects/index.ts`：v5 schema、严格 parser、迁移、order invariant、原子 move。
- `electron/domains/projects/projects.test.ts`：迁移、排序、跨组、生命周期及持久化回归。
- `electron/contracts.ts`、`electron/ipc.ts`、`electron/ipc.test.ts`：窄 `project_move` 命令。
- `src/bindings/generated.ts`、`src/bindings/index.ts`：`projectOrder` 和命令类型。
- `src/features/projects/projectsApi.ts`、`projectsStore.ts` 及测试：权威 catalog、preview/rollback/pending。
- `src/features/projects/projectDnd.ts` 及测试：纯顺序变换与 drop intent。
- `src/features/projects/ProjectRail.tsx`、`ProjectRail.test.tsx`：DndContext、group targets、sortable project、overlay 和可访问性。
- 如组件复杂度需要，新增 `ProjectGroupSection.tsx` / `SortableProjectEntry.tsx`，不改变既有功能边界。
- `src/i18n/en.ts`、`src/i18n/zh-CN.ts`：拖拽与 live-region 双语文案。
- `src/styles/index.css`：handle、source、overlay、group target、insert indicator、pending/reduced-motion。
- `package.json`、`pnpm-lock.yaml`：精确锁定 dnd-kit 依赖。
- `CHANGELOG.md`：用户可见功能。

## Order of work

1. 记录当前测试基线；补 v4 → v5、全排列校验和 move 领域失败测试，确认 red。
2. 实现 v5 类型、迁移和 order helper；移除 catalog 的 `lastOpenedAt` 强制排序，并让 open/close/group-delete/session-sync 维护 invariant。
3. 实现 `moveProject()`，覆盖同组、跨组、Ungrouped、空组、末尾、no-op 和错误原子性。
4. 先补 IPC 参数测试，再加入 `project_move` allowlist/dispatch/bindings/API；保留旧命令并给出明确“目标末尾”语义。
5. 安装精确版本 dnd-kit 依赖并通过 license 检查。
6. 编写 `projectDnd.ts` 纯函数测试与实现，隔离 JSDOM 无布局的限制。
7. 在 ProjectRail 接入 sensors、stable IDs、独立 handle、group droppable、overlay、indicator、announcements 和焦点恢复；先完成键盘集成测试，再补可控的 pointer/drop intent 测试。
8. 接入单次 pending、乐观 catalog、成功权威覆盖和失败回滚；pending 时禁用冲突 mutation。
9. 更新菜单移动调用、双语文案、CSS、CHANGELOG 和本文档的实际偏差。
10. 运行聚焦测试、format/lint/typecheck、完整 `pnpm check`。
11. 在 macOS arm64 构建、签名验证、安装并实际 smoke：同组重排、跨组、Ungrouped、空/折叠组、重启保持。
12. 提交独立 commit，推送分支并创建 PR；记录跨平台 CI。

## Verification commands

```bash
pnpm exec vitest run electron/domains/projects/projects.test.ts electron/ipc.test.ts src/features/projects/projectsStore.test.ts src/features/projects/projectDnd.test.ts src/features/projects/ProjectRail.test.tsx
pnpm format:check
pnpm lint
pnpm typecheck
pnpm check
pnpm bundle
```

## Risk controls

- **不可降级 schema**：明确 v5 风险；迁移前 fixture 验证当前可见顺序，迁移只原子落盘。
- **order 漂移**：parser 要求严格全排列；所有 project 新增/删除路径有测试。
- **部分移动**：group 与 position 只允许一个 Main transaction，不拆分 IPC。
- **异步覆盖**：一次只允许一个 move pending；成功以权威 catalog 替换，失败恢复完整快照。
- **误拖与点击冲突**：独立 handle + pointer activation distance；回归测试展开、选择、菜单和 worktree 操作。
- **隐藏目标**：空/折叠 group heading 永久注册末尾 drop target。
- **JSDOM 坐标不足**：drop intent 和数组变换用纯函数测试；组件测试以 keyboard 与显式事件适配层为主；最终做真实应用 smoke。
- **依赖供应链/许可证**：精确锁版本并运行现有 license、secret 和完整 release gate。

## Implementation proof

- `ProjectCatalog` v5、v4 迁移、严格全排列、project 生命周期和原子 `project_move` 已由 domain/IPC 测试覆盖。
- Renderer 已接入 6px Pointer sensor、Keyboard sensor、独立 handle、overlay、group target、before/after indicator、乐观更新、失败回滚、焦点恢复和双语播报；菜单继续作为替代入口。
- 精确依赖版本为 `@dnd-kit/core@6.3.1`、`@dnd-kit/sortable@10.0.0`、`@dnd-kit/utilities@3.2.2`，license gate 通过。
- `pnpm check` 通过：73 个 Vitest 文件、499 个测试以及 18 个 release tests。
- `pnpm bundle`、app/DMG smoke 和严格 codesign 校验通过。
- macOS arm64 packaged-app CDP smoke 从 v4 fixture 启动，实际用 pointer 将 `alpha` 拖入空分组，确认 UI 更新、v5 落盘和 `projectOrder` 全排列；后续回归 smoke 在拖拽期间验证源行与后续行的 Y 坐标不变、computed transform 均为 `none`，drop 后顺序仍正确持久化。
- 最新构建已安装到 `/Applications/SpireCode.app` 并启动；实际 profile 为合法 v5 catalog。

## Implementation deviation

拖拽不在 pointer 移动期间把源 DOM 插入目标列表，也不对源行之后的 project 应用 sortable transform。首次 packaged-app smoke 证明跨组临时插入会让源分组收缩并使空分组标题移出 pointer；后续用户反馈进一步证明默认 `verticalListSortingStrategy` 会让底部 project 跟随变换，与 Codex 的固定占位效果不一致。最终实现使用静态 sorting strategy，让所有 project 行保持原位，只用源行透明度、overlay、目标高亮和 indicator 预览。drop 后的 optimistic catalog、Main 权威覆盖和失败回滚保持原规格。

## Rollback

代码回滚前，已经写入 v5 的 profile 不能由 v4 直接读取。若发布后必须回滚，需要先提供显式 v5 → v4 数据降级工具或保留能读取 v5、但关闭拖拽 UI 的兼容版本；不得直接发布只认识 v4 的二进制覆盖。
