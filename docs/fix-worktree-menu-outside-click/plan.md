# Plan: 修复 Worktree 菜单无法点击外部关闭（from `docs/fix-worktree-menu-outside-click/spec.md` 2026-09-14）

## Files that change

- `docs/fix-worktree-menu-outside-click/{intent,spec,plan}.md`：记录问题、设计和执行计划。
- `src/features/projects/ProjectRail.test.tsx`：增加点击菜单外部关闭的回归测试。
- `src/features/projects/ProjectRail.tsx`：为打开的 worktree 菜单增加受控的 outside-click 监听与清理。

## Order of work

1. 在 `ProjectRail.test.tsx` 新增回归用例：展开 Project、打开 managed worktree 菜单、点击菜单外区域，并断言 Rename/Delete 消失。
2. 单独运行该测试，确认当前实现下失败（red）。
3. 在 `ProjectRail` 中为当前打开菜单的 row 保存 ref，并仅在菜单打开期间注册 `document.pointerdown` 监听。
4. 事件发生在 row 外时关闭菜单；发生在按钮或菜单内部时保持现有交互。
5. 重新运行针对性测试确认通过（green），再运行 `pnpm check`。

## Risks

- 最大风险是 document 级监听把触发按钮或菜单项点击误判为外部点击；通过以包含按钮和菜单的 row 作为 containment 边界规避。
- 监听未清理可能导致重复处理或卸载后更新；使用 React effect cleanup 约束生命周期。
- 不采用透明全屏 backdrop，因为它会引入层级、布局和事件拦截变化，超出这个局部修复的必要范围。

## Proof

```bash
pnpm test -- src/features/projects/ProjectRail.test.tsx
pnpm check
```

验收结果：菜单打开后点击外部区域立即关闭；点击菜单内部和更多按钮仍保持原有行为；完整检查退出码为 0。
