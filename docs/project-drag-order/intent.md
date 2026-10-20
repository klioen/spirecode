# Intent: Projects 拖拽移动与排序

Status: implemented。 Extends: `docs/project-groups/`。

## Problem

Projects 当前只能通过项目菜单把项目移动到另一个分组，且 Main 每次返回 catalog 时都会按 `lastOpenedAt` 重新排序。用户无法直接拖拽项目，也无法保存分组内的手工顺序。

## Goal

- 项目可以拖到其他自定义分组或 Ungrouped。
- 同一分组内可以拖拽调整项目顺序。
- 顺序跨重启持久化；移动不改变项目、worktree、Pi session、Chat 或 Terminal 生命周期。
- 保留“Move to group…”菜单作为非拖拽替代入口。
- Pointer 与键盘拖拽都有明确的目标、插入位置、取消、失败恢复和无障碍播报。

## Codex shipped-artifact reference

使用 REA 静态分析本机 `/Applications/ChatGPT.app/Contents/Resources/app.asar` 中的 Codex 26.1013.40934（ASAR SHA-256 `5ddc4e48259aa6f979e04529b1a5a4ae54b0f5c4ad6db5c6e004924c10916ddb`）。REA 主 Evidence：`ev_b38e998afc1fb44ea373b80d19ae817969579ff9619cc9d745311df8e31e7ba8`；入口模块 Evidence：`ev_b99272b697d2ac6b05a5fec71c298a245074133eb64d85503944c7f690db56bf`。

静态证据显示 Codex：

- 使用 sortable DnD context，并给 project 使用稳定 ID `sidebar-group:<projectId>`；
- 把 drag handle listeners/ref 与项目行的点击行为分离；
- Pointer 拖拽设置 6px activation distance，并同时注册 Keyboard sensor；
- 通过拖拽 overlay、源行降透明度和 before/after 插入线提供反馈；
- 用 pointer/active rect 相对目标中点确定 before/after；
- 拖拽期间维护临时显示顺序，完成后持久化 project order；持久化失败恢复缓存并重新校验权威状态；
- 跨 sidebar section 移动时以目标 container 和 `beforeItemId` 表达位置，而不是让 Renderer 提交完整持久化对象。

这些是 shipped artifact 的静态观察，不等于运行时执行证明。REA 对 14 MB minified `app-initial` 的语义分析触发 heap 限制，因此结论同时由 artifact 中对应的 inert JavaScript 字节和局部格式化代码复核；未选择的 16317 个文件与动态路径保持未知。

## Product decisions

SpireCode 采用 Codex 的交互原则，但保持更窄的领域模型：

- 分组本身不参与拖拽排序；只移动 project。
- 展开的目标分组支持精确 before/after 插入；空分组和折叠分组标题支持追加到末尾。
- 一次只提交一个 project move，避免完整 catalog 返回值发生并发覆盖。
- Main 仍是持久化权威；Renderer 只做可回滚的临时预览。

## Risk classification

High risk：需要把 `ProjectCatalog` v4 升级到 v5，改变持久化格式、迁移路径、Main/Renderer 类型与 IPC contract；旧版应用无法保证读取 v5 状态。用户已明确确认本 Intent、Spec、Plan 及不可直接降级风险后实施。
