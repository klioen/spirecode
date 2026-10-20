# Spec: Projects 拖拽移动与排序

Status: implemented。 Implements: `docs/project-drag-order/intent.md`。

## Durable model

`PROJECT_STATE_VERSION` 从 4 升到 5，`ProjectCatalog` 新增：

```ts
projectOrder: string[]
```

`projectOrder` 是所有 `projects[].id` 的严格全排列。一个分组的显示顺序定义为从 `projectOrder` 过滤出 `project.groupId` 等于该分组 ID 的项目；Ungrouped 使用 `groupId === null`。

当前版本 parser 必须拒绝：

- 非字符串数组；
- 重复 project ID；
- 不存在的 project ID；
- 缺失任意已有 project ID。

不使用浮点 rank 或 `position`，避免重复值、精度耗尽和重编号。

## Migration and compatibility

- v4 → v5：按照 v4 实际可见顺序 `lastOpenedAt DESC` 生成 `projectOrder`；时间相同时保持原数组稳定顺序。
- v0/v1/v2/v3 的既有迁移直接产出合法 v5 catalog。
- 迁移必须保留 group、project/worktree ID、路径、归属、时间戳和 `activeWorktreeId`。
- 迁移成功后继续通过 `saveAtomic` 回写。
- v5 不保证被旧 v4 应用降级读取。

## Domain behavior

新增原子操作：

```ts
moveProject(
  projectId: string,
  targetGroupId: string | null,
  beforeProjectId: string | null,
): Promise<ProjectCatalog>
```

规则：

- `targetGroupId: null` 表示 Ungrouped。
- `beforeProjectId` 必须属于目标分组且不能等于源 project；`null` 表示目标分组末尾。
- 同分组移动只改变顺序；跨分组移动在同一个 `transactCatalog()` 内同时改变 `groupId` 和 `projectOrder`。
- 相同有效位置是 no-op，返回当前权威 catalog。
- 不修改 `lastOpenedAt`、worktree、active worktree 或运行中的 Chat/Terminal/Pi session。
- 不存在的 project/group/anchor 返回 `NOT_FOUND`；anchor 不属于目标分组返回 `INVALID_ARGUMENT`；失败不得修改磁盘或内存 catalog。

其他 catalog mutation 必须维护全排列：

- 新打开或 session 同步新发现的 project 插入 Ungrouped 首位；按启动同步现有的升序处理方式，最终仍保持最新 project 在前。
- 重新打开已有 project 只更新时间，不改变手工顺序。
- 关闭 project 同时从 `projectOrder` 移除。
- 删除 group 时，其项目移动到 Ungrouped 末尾，并保持被删除组内及原 Ungrouped 内的相对顺序。
- 菜单“Move to group…”复用 `moveProject(..., null)`，语义为追加到目标分组末尾。
- `catalog()`、`snapshotCatalog()` 和 `list()` 均按 `projectOrder` 返回 projects，不再按 `lastOpenedAt` 覆盖手工顺序。

## IPC contract

新增 allowlisted 命令：

```text
project_move(projectId, targetGroupId | null, beforeProjectId | null)
```

Main 只接受三个字段，逐个执行长度和 nullable string 校验，拒绝路径、project 对象、order 数组、catalog 及额外字段。命令返回完整 `ProjectCatalog`。

保留 `project_group_set_project` 以避免不必要的兼容破坏，但 Renderer 的菜单移动改用 `project_move`。旧命令在 Main 中定义为移动到目标分组末尾，确保不会产生未定义位置。

## Renderer interaction

- 使用稳定 project ID 和 group target ID 建立一个 Projects DnD context。
- project 行增加独立 drag handle，避免与展开、选择、菜单和 worktree 操作冲突。
- Pointer sensor 使用 activation distance，普通点击不能误触拖拽。
- Keyboard sensor 支持 Space/Enter 拾取或放下、方向键移动、Escape 取消。
- 展开分组提供项目间 before/after drop slot；空分组和折叠分组标题提供“追加到末尾”目标。
- 拖拽 overlay 仅显示项目图标和名称，不复制 worktree/session 子树。
- 源行保留占位并降低透明度；目标分组高亮；插入位置显示不只依赖颜色的水平指示线。
- 拖拽期间所有 project 行保持原位，源行仅降低透明度；drag overlay 跟随 pointer/keyboard，目标分组高亮并用 before/after 指示线预览最终位置。不得让源分组收缩或让源行之后的 project 发生 sortable transform；drop 后才以完整 catalog 快照乐观更新 Zustand，并设置全局单次 move pending。
- 成功时使用 Main 返回的完整 catalog 覆盖 preview；失败时恢复 drop 前 catalog、显示现有结构化错误、通过 live region 播报恢复，并把焦点还给源项目 drag handle。
- pending 期间禁止新的 project drag、菜单移动和 group mutation，避免旧完整 catalog 覆盖新状态。
- group/project 折叠状态不进入持久化 model，移动不得自动改变长期折叠状态。

## Accessibility and localization

- drag handle 有包含 project 名称的双语 `aria-label` 和 `focus-visible` 样式。
- live region 播报拾取、目标 group/position、完成、取消和失败恢复。
- 空/折叠分组仍可作为可理解的 drop target。
- `prefers-reduced-motion` 下关闭或缩短 overlay 与位移动画。
- 新增文案必须同时进入 `src/i18n/en.ts` 与 `src/i18n/zh-CN.ts`，占位符一致。
- “Move to group…”对话框继续存在，作为键盘/辅助技术替代入口。

## Dependency decision

采用 Codex 同类的 `@dnd-kit/core`、`@dnd-kit/sortable`、`@dnd-kit/utilities`，在 `package.json` 中精确锁版本并提交 `pnpm-lock.yaml`。原因是它原生覆盖 Pointer/Keyboard sensors、sortable transform、overlay 和 announcements；原生 HTML5 DnD 无法可靠满足 Electron、触控和键盘可访问性。依赖必须通过现有 licenses/secrets/check 门禁。

## Out of scope

- group 自身拖拽排序；
- 多选或批量移动；
- 多级嵌套 group；
- 多窗口实时同步或 catalog CAS revision；
- session/worktree 行拖拽；
- 改变 project 路径或文件系统内容。

## Acceptance proof

- v4 → v5 及 v0-v3 迁移测试证明顺序、归属和 ID 不丢失。
- ProjectService 测试覆盖同组排序、跨组/Ungrouped、空组、anchor 校验、删除组、关闭/新增/重开/session sync 和重启持久化。
- IPC 测试覆盖 nullable anchor/group、字段白名单和错误类型。
- 纯函数测试覆盖 before/after、no-op、跨组和 preview/rollback。
- ProjectRail 测试覆盖 drag handle、键盘移动/取消、空/折叠组、pending、成功权威替换、失败恢复和现有点击/菜单行为。
- `pnpm check` 全量通过，并在 macOS 构建安装后进行实际 pointer 拖拽 smoke test。
