# Plan: Workbench UI accessibility and narrow-layout hardening

From `docs/ui-accessibility-hardening/spec.md`. Status: delivered 2026-09-19.

## Files that change

- `src/features/editor/EditorPane.tsx`、tests、styles：合法 tab/close 结构与键盘语义。
- 新增共享 modal focus hook/utility；`SettingsDialog.tsx`、`WorktreeDialog.tsx` 及 tests：focus trap/restore/pending dismissal。
- `WorktreeDialog.tsx` 及 tests：branch combobox active option 与键盘导航。
- 新增共享 tree keyboard utility；`FileTree.tsx`、`ChangesPanel.tsx`、stores/tests：tree semantics 与 roving focus。
- `ChatComposer.tsx`、tests、styles：窄宽度 wrap/shrink contract。
- 中英文目录仅在需要新增可见/辅助文案时更新。

## Order of work

1. Editor tabs：先写 DOM/keyboard 失败测试，拆 activation 与 close button，跑 Editor 回归。
2. Dialogs：实现共享 focus lifecycle；先覆盖 Settings，再接 Worktree pending 状态。
3. Combobox：先写 Arrow/Home/End/Enter 失败矩阵，再实现 active descendant。
4. Trees：抽取纯 visible-tree keyboard helpers；分别接 FileTree 与 ChangesPanel，保持 store 状态。
5. Composer：增加窄宽度样式 contract test，调整 flex/wrap。
6. targeted tests 后运行完整 `pnpm check`、audit、build 和 macOS bundle smoke。
7. Bugs/Security/Compliance 三遍 review，更新本计划状态。

## Risks

- Tab DOM 重构可能影响现有 CSS 宽度和 close hover；用现有截图式 DOM 断言和行为测试保护。
- Focus trap 错误可能造成无法退出 dialog；Escape/backdrop/close button 和 pending 两种状态都需覆盖。
- Tree keyboard 模型最容易和异步刷新、折叠状态冲突；共享 helper 只处理可见节点与动作，不拥有业务数据。
- Worktree combobox 的 active option 必须随过滤结果变化，不能提交 stale branch。
- Composer wrap 不应改变宽屏布局或按钮顺序。

## Implementation status

Delivered in order: accessible Editor tab controls; modal focus trap/restore and pending dismissal protection; keyboard-complete branch combobox; Files/Changes tree semantics and roving focus; narrow-width Chat composer layout. Independent review findings for pending focus, tree fallback focus, unique option IDs, and option tab order were fixed before final verification.

## Proof

```bash
pnpm exec vitest run \
  src/features/editor/EditorPane.test.tsx \
  src/features/settings/SettingsDialog.test.tsx \
  src/features/projects/WorktreeDialog.test.tsx \
  src/features/files/FileTree.test.tsx \
  src/features/changes/ChangesPanel.test.tsx \
  src/features/chat/ChatComposer.test.tsx
pnpm check
pnpm audit --prod --audit-level moderate
pnpm build
pnpm bundle
```
