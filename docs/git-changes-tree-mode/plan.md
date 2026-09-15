# Plan: Changes 列表与目录树视图切换（from docs/git-changes-tree-mode/spec.md 2026-09-15）

## Files that change

- `src/features/changes/ChangesPanel.tsx`
  - 增加 List/Tree 模式切换控件。
  - 增加 GitChange 路径树构建、目录递归展示和折叠交互。
  - 复用两种模式的文件打开与状态展示逻辑。
- `src/features/changes/ChangesPanel.test.tsx`（新增）
  - 验证默认 List、Tree 切换、目录层级、目录折叠和文件打开行为。
- `src/features/changes/changesStore.test.ts`
  - 验证默认 List 模式以及显式模式切换。
- `src/styles/index.css`
  - 增加工具栏模式分段控件、Tree 目录/文件行缩进和选中态样式。
- `docs/git-changes-tree-mode/{intent.md,spec.md,plan.md}`
  - 保存本次变更的需求、设计、实施与验证基线。

## Order of work

1. 先添加 ChangesPanel 组件测试，描述默认 List、切换 Tree、默认展开和折叠行为，并运行测试确认当前实现不满足 Tree 场景。
2. 在 ChangesPanel 中提取共享 change 文件行与打开 diff 的逻辑。
3. 实现确定性的路径树构建函数和递归目录渲染，在三个现有分组内分别使用。
4. 接入 `changesStore.mode`，在工具栏右侧增加 List/Tree 模式按钮并保留 Refresh。
5. 添加最小 CSS，使切换控件有明确 active 状态，树节点按深度缩进且长名称截断。
6. 运行目标测试，再运行 `pnpm check`；根据失败修正实现而不削弱测试。

## Risks

- 最危险的是重构文件行时改变 diff 的 scope/path 或单双击行为；通过对两种模式复用同一文件行组件及交互测试规避。
- 路径树若以显示名称作为 key，重复目录名会冲突；实现使用 scope 加完整相对路径。
- 将“展开目录”列表显式初始化会在 Git 刷新新增目录时错误折叠；因此反向保存 collapsed 集合，新目录默认展开。
- 不选择把 tree 数据放入 Zustand：它可由 snapshot 确定性派生，存入 store 会制造重复状态。store 只保留用户选择的模式。

## Proof

- `pnpm vitest run src/features/changes/ChangesPanel.test.tsx src/features/changes/changesStore.test.ts`
- `pnpm check`
- 组件测试应证明初始 List 按完整路径展示、切换 Tree 后目录和文件分层出现、目录初始展开且点击可折叠、文件仍打开正确 diff resource。
