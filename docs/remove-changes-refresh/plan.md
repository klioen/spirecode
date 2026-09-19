# Plan: 移除 Changes 手动刷新图标（from docs/remove-changes-refresh/spec.md 2026-09-19）

## Files that change

- `src/features/changes/ChangesPanel.test.tsx`
  - 增加刷新按钮不存在且首次加载仍自动刷新的回归测试。
- `src/features/changes/ChangesPanel.tsx`
  - 移除刷新图标 import 与按钮 JSX，保留自动刷新 effect。
- `src/features/workbench/Workbench.tsx`
  - 将 Files/Changes 文字切换替换为带 accessible name 和 title 的图标按钮。
- `src/features/workbench/Workbench.test.tsx`
  - 验证图标切换没有可见文字且仍能切换面板。
- `src/i18n/en.ts`
  - 删除不再使用的英文刷新文案。
- `src/i18n/zh-CN.ts`
  - 删除不再使用的中文刷新文案。
- `docs/remove-changes-refresh/{intent.md,spec.md,plan.md}`
  - 保存本次变更的需求、设计、实施与验证基线。

## Order of work

1. 添加组件回归测试，断言刷新按钮不存在且挂载仍调用 `refreshChanges`，运行确认当前实现失败。
2. 移除刷新按钮和图标 import。
3. 将 Workbench 右侧 Files/Changes 文字切换替换为图标按钮，并补充可访问性与交互测试。
4. 删除中英文无用刷新文案。
5. 运行目标测试、本地化检查、lint、typecheck 和完整测试。
6. 打包并安全替换 `/Applications/SpireCode.app`，验证签名、哈希与 smoke test。

## Risks

- 最危险的是误删首次加载或事件驱动刷新；组件测试覆盖首次加载，现有 `changesRefresh.test.ts` 覆盖 Git 事件刷新。
- 删除单侧国际化 key 会导致语言目录不一致，因此同时修改两种语言并运行 `i18n:check`。
- 图标按钮若没有 accessible name 会降低可用性，因此保留现有本地化标签作为 `aria-label` 和 `title`。
- 不改 `changesRefresh.ts`，避免扩大行为范围。

## Proof

- Red：`pnpm exec vitest run src/features/changes/ChangesPanel.test.tsx` 新断言在当前刷新按钮存在时失败。
- Green：Changes 目标测试通过。
- `pnpm i18n:check && pnpm lint && pnpm typecheck && pnpm test` 全部通过。
- `pnpm bundle`、安装副本签名检查和 `scripts/smoke-app.sh` 通过。
