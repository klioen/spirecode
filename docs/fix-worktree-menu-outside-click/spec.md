# Spec: 修复 Worktree 菜单无法点击外部关闭
Status: proposed。 Implements: `docs/fix-worktree-menu-outside-click/intent.md`。

## Requirements

- managed worktree 的操作菜单打开后，点击菜单和对应触发按钮之外的区域应关闭菜单。
- 点击菜单内部不应因 outside-click 逻辑提前关闭，Rename/Delete 原有行为保持不变。
- 再次点击对应“更多”按钮仍应关闭菜单。
- outside-click 监听在没有打开菜单时不应注册，并在 effect 清理时移除。

## Design

- `ProjectRail` 使用一个 ref 标记当前菜单所在的 worktree row 容器。
- 当 `menuWorktreeId` 非空时，在 `document` 上注册 `pointerdown` 监听。
- 若事件 target 不在当前菜单 row 内，将 `menuWorktreeId` 设为 `null`；否则不处理。
- effect 在菜单关闭、切换或组件卸载时移除监听。
- 组件测试打开菜单后点击 rail 中的外部元素，断言菜单项消失；同时保留菜单按钮切换和内部操作现有断言。

## Out of scope

- 调整菜单定位、视觉样式或键盘导航。
- 改动其他弹窗和下拉菜单。

## Proof

- 新回归测试在修复前失败、修复后通过。
- `pnpm test -- src/features/projects/ProjectRail.test.tsx` 通过。
- `pnpm check` 全量通过。
