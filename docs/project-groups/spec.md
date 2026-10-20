# Spec: Projects 项目分组
Status: accepted and implemented。 Implements: `docs/project-groups/intent.md`。

## Durable model

- `PROJECT_STATE_VERSION` 从 3 升到 4。
- `ProjectCatalog` 新增按创建顺序保存的 `groups: ProjectGroupSummary[]`。
- `ProjectGroupSummary` 包含 UUID `id` 与 trim 后的非空 `name`。
- `ProjectSummary` 新增必需字段 `groupId: string | null`；`null` 表示未分组。
- 分组名称在 trim 后按大小写不敏感比较保持唯一，避免菜单和无障碍名称产生歧义。
- 当前版本 parser 拒绝重复 group UUID、重复规范化名称，以及引用不存在分组的 `project.groupId`。

## Migration and compatibility

- v3 → v4：补 `groups: []`，所有项目补 `groupId: null`，保持所有 Project/Worktree UUID、路径、activeWorktreeId 和时间戳不变。
- v1/v2 迁移直接产出 v4，并同样把项目置为未分组。
- version 0 空 catalog 显式转换为 v4 空 catalog，不用 v4 parser 猜测旧结构。
- 迁移成功后继续通过 `saveAtomic` 回写；非法结构继续返回 `INVALID_ARGUMENT`，损坏 JSON 继续备份后重置。
- v4 状态不保证可被当前 v3 二进制降级读取。

## Domain behavior

- 新建分组生成 UUID 并追加到 `groups`；空白、过长或重名名称返回 `INVALID_ARGUMENT`。
- 重命名保留 group UUID 和顺序。
- 删除分组在同一个事务中删除 group，并把所有关联项目的 `groupId` 置为 `null`。
- 移动项目只修改 `groupId`，不修改 `lastOpenedAt`、worktree、activeWorktreeId 或运行中的资源。
- 新打开项目默认未分组；重新打开已有项目和 directory → git 升级都保留原归属。
- 关闭项目不删除空分组。
- 所有 mutation 返回完整的权威 `ProjectCatalog`，Renderer 使用返回值替换 store，不做持久化状态的乐观拼接。

## IPC contract

新增 allowlisted 命令：

- `project_group_create(name)`
- `project_group_rename(groupId, name)`
- `project_group_delete(groupId)`
- `project_group_set_project(projectId, groupId | null)`

要求：

- `groupId: null` 只在 set-project 命令中表示移到未分组。
- Main 对字段集合、类型、长度和 ID 做窄校验；拒绝路径、项目对象、catalog 或额外字段。
- 不新增通用文件系统、IPC 或 Node 权限。

## ProjectRail interaction

- 顶部保留“打开目录”，新增“创建分组”按钮。
- 用户分组按 catalog 顺序显示；存在未分组项目时，在用户分组之后显示合成的“未分组”。
- 空的用户分组继续显示，便于后续移动项目；空的“未分组”不显示。
- 分组默认展开并具有 `aria-expanded`；折叠只隐藏项目，不改变 active worktree。
- 项目仍默认折叠 worktree，维持现有 Git/Directory Project 行为。
- 分组标题菜单包含“重命名分组”“删除分组”。删除前确认，并明确其中项目会移到未分组、文件不会删除。
- 项目菜单新增“移动到分组…”，对话框列出所有用户分组与“未分组”；目标与当前归属相同时禁止提交。
- 创建、重命名、删除、移动均显示 pending 状态，错误进入现有结构化错误展示，不提前改变 durable UI state。
- 分组折叠状态仅保留在 Renderer view state，不写入 ProjectCatalog。
- 分组内存在活动 Pi 会话时，分组标题显示现有 session spinner，避免折叠后丢失运行状态提示。

## Validation and accessibility

- 分组名称 trim 后不能为空，沿用 IPC `name` 长度上限。
- 对话框支持初始聚焦、Enter 提交、Escape 取消；pending 时避免重复提交。
- 菜单、折叠按钮、表单字段和确认操作均有双语可访问名称与 `focus-visible` 样式。
- 中英文 i18n key 和占位符保持一致。

## Out of scope

- 拖拽移动、手工排序、批量移动。
- 多级嵌套分组、颜色、图标、智能/自动分组。
- 一个项目加入多个分组。
- 跨重启持久化分组或项目的折叠状态。
- 重命名项目目录、删除项目文件或改变 Git/worktree 生命周期。
- 多窗口实时广播；当前 mutation 返回 catalog 满足现有单窗口架构。

## Proof

- ProjectService 临时状态文件测试覆盖 v1/v2/v3 → v4、CRUD、归组、删除解除归属、重启保留和非法外键。
- IPC 测试覆盖命令 allowlist、nullable groupId、长度/类型/额外字段拒绝。
- Store、ProjectRail 和分组对话框测试覆盖 grouped/ungrouped 展示、折叠、CRUD、移动、失败回滚、运行状态和无障碍语义。
- `pnpm check` 全量通过。
