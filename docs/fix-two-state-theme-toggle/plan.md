# Plan: 二态主题切换（from `docs/fix-two-state-theme-toggle/spec.md` 2026-09-14）

## Files that change

- `docs/fix-two-state-theme-toggle/{intent.md,spec.md,plan.md}`：记录独立 bugfix 的意图、设计和实施证明。
- `src/features/theme/themeStore.ts`：将公开主题模式收敛为 light/dark，并迁移历史 system 设置。
- `src/features/theme/themeStore.test.ts`：覆盖迁移、首次解析和二态循环。
- `src/features/theme/ThemeToggle.tsx`：移除电脑图标，仅在太阳/月亮间切换。
- `src/features/theme/ThemeToggle.test.tsx`：验证两个可见状态和连续切换。

## Order of work

1. 先修改 store 与按钮测试，复现第三个 system 状态并确认测试失败。
2. 将 theme store 改为二态模型，启动时把历史 system 或空设置解析并持久化为具体主题。
3. 简化 ThemeToggle 图标和无障碍标签逻辑，移除电脑图标依赖。
4. 运行主题定向测试和 `pnpm check`。

## Risks

- 最大风险是历史 `system` 用户升级后主题改变；通过启动时读取系统外观并固化为对应显式主题降低迁移突兀感。
- 移除运行时 system 监听意味着操作系统切换后应用不自动变化，这是用户确认的纯二态交互的预期结果。
- 不直接删除 `resolved`，避免扩大 Monaco/xterm 等消费者的改动范围。
- 未采用“保留 system 但隐藏电脑图标”，因为该方案仍会产生不可见的第三状态，按钮行为难以预测。

## Proof

- Red：`pnpm test -- src/features/theme/themeStore.test.ts src/features/theme/ThemeToggle.test.tsx` 在旧三态实现上失败。
- Green：同一命令在修复后通过。
- Full：`pnpm check` 全部退出 0。
