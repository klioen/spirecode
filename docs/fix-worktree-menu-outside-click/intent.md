# Intent: 修复 Worktree 菜单无法点击外部关闭
Author: keliangliang。 Status: draft。

## Problem

Projects 侧栏中点击 managed worktree 的“更多”按钮后会弹出操作菜单，但点击菜单之外的区域不会关闭菜单，用户必须再次点击原“更多”按钮。

## Proposed outcome

Worktree 操作菜单打开后，点击菜单及其触发按钮之外的任意区域会立即关闭；菜单按钮自身仍可正常切换开关，菜单项仍可正常触发操作。

## Affected users and systems

使用 Projects 侧栏 managed worktree 菜单的用户；仅影响 Renderer 的 `ProjectRail` 组件及其测试。

## Constraints

- 不改变 Rename/Delete 行为及权限边界。
- 不引入新依赖。
- 外部点击监听仅在菜单打开时存在，并在关闭或组件卸载时清理。
- 点击菜单内部或触发按钮不得被误判为外部点击。

## Open questions

无。
