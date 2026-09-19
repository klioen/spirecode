# Spec: 移除 Changes 手动刷新图标

## Requirements

1. Changes 工具栏不得显示手动刷新按钮或刷新图标。
2. Changes 工具栏继续显示 List/Tree 模式切换控件。
3. ChangesPanel 挂载时继续自动获取当前 Git 状态。
4. `git://changed` 事件继续触发自动刷新和 diff 失效。
5. 删除仅供已移除按钮使用的中英文 `changes.refresh` 文案。
6. Workbench 右侧 Files/Changes 切换按钮不得显示文字内容，分别显示文件与 Git 变更图标。
7. 两个图标按钮继续使用本地化的 `workbench.files` / `workbench.changes` 作为 `aria-label` 和 `title`，并维持 active 状态和切换行为。

## Design

- 从 `ChangesPanel.tsx` 移除 `RiRefreshLine` import 和刷新按钮 JSX。
- 保留组件 `useEffect` 中的 `refreshChanges(worktreeId)`。
- 不修改 `changesRefresh.ts`，避免影响 Git 事件驱动的刷新链路。
- Changes 组件测试断言刷新 accessible name 不再出现，同时确认首次加载仍调用刷新函数。
- Workbench 使用 Remix Icon 的文件夹与 Git commit 图标替换文字，并通过 accessible name 测试保证切换行为不变。

## Concerns

- 误删 `refreshChanges` import 会破坏首次加载刷新；该 import 仍由 `useEffect` 使用。
- 国际化 key 删除后必须运行本地化检查，确保中英文目录一致。
- `workbench.files` / `workbench.changes` 仍用于可访问名称，不能随可见文字一起删除。
