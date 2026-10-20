# Intent: Projects 项目分组
Status: accepted and implemented。

## Problem

Projects 侧栏中的项目数量增多后，当前扁平列表只能按最近打开时间排列，难以按业务、团队或用途快速定位项目。Project 自身的 worktree 折叠只能降低单个项目的展开密度，不能解决项目之间的组织问题。

## Proposed outcome

- 用户可以创建、重命名和删除自定义项目分组。
- 用户可以把一个项目移动到某个分组，或移回“未分组”。
- Projects 侧栏按“分组 → 项目 → worktree”展示，分组和项目均可独立折叠。
- 分组及项目归属跨应用重启保留；分组折叠状态仅属于当前 Renderer 视图会话。
- 删除分组只解除项目归属，不关闭项目、不删除目录、不停止 Terminal/Chat，也不改变 active worktree。

## Affected users and systems

使用 Projects 侧栏管理多个项目的用户；涉及 Electron Main 的 ProjectCatalog 持久化、窄 IPC 契约、Renderer bindings/Zustand、ProjectRail、对话框、双语文案及测试。

## Constraints

- Electron Main 继续是 ProjectCatalog 的唯一持久化权威；Renderer 不直接访问状态文件。
- Renderer 只传 `groupId`、`projectId` 和名称，不传任意路径或完整 catalog 对象。
- 一个项目最多属于一个分组；不支持嵌套分组或标签式多归属。
- “未分组”是 `groupId: null` 的合成视图，不创建可重命名的真实分组。
- 项目和组内项目继续使用现有最近打开顺序；用户分组按创建顺序展示。
- 继续使用 `AsyncQueue`、copy-on-write 和 `saveAtomic`，任何失败都不得只更新内存或只更新 Renderer。

## Risk decision

高风险：需要把 Projects 持久化格式从 v3 升级到 v4，并新增跨进程契约；旧版本应用无法读取写入后的 v4 状态，因此实施前需要用户明确确认。

## Decisions

- 已确认采用“自定义、单归属、不可嵌套”的分组 MVP。
- 已确认接受 ProjectCatalog v4 不能由当前只支持 v3 的旧版 SpireCode 直接读取。
