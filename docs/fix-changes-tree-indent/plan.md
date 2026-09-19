# Plan: 收紧 Changes 树形视图缩进（from docs/fix-changes-tree-indent/spec.md 2026-09-19）

## Files that change

- `src/features/changes/ChangesPanel.test.tsx`
  - 增加树形目录与深层 diff 文件紧凑缩进的回归断言。
- `src/features/changes/ChangesPanel.tsx`
  - 统一目录和文件的树形缩进计算，将每级步长从 14px 收紧为 8px，并移除 Changes 文件行额外的缩进占位。
- `docs/fix-changes-tree-indent/{intent.md,spec.md,plan.md}`
  - 保存独立 bugfix 的需求、设计、实施和验证基线。

## Order of work

1. 添加回归测试，断言根目录 12px、一级目录 20px、三级文件 36px，并断言 Changes 文件行不渲染额外缩进占位。
2. 使用共享树形缩进计算，将目录和文件统一改为每级 8px，并移除文件行占位。
3. 运行 Changes 目标测试，再运行 `pnpm check`。

## Risks

- 最危险的是目录和文件使用不同公式而产生错位；通过共享计算函数和同时断言两类节点规避。
- Files 面板仍需要自身的文件占位，本次只移除 Changes 文件行内的占位，避免扩大修复范围。
- 不通过 CSS 后代选择器覆盖 inline style，避免形成两套相互竞争的缩进规则。

## Proof

- Red：`pnpm exec vitest run src/features/changes/ChangesPanel.test.tsx` 新断言在现有实现下失败。
- Green：同一目标测试修复后通过。
- 完整门禁：`pnpm check` 全部退出 0。
