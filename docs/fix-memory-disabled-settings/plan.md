# Plan: pi-memory 关闭时禁用 Memory 设置（from `docs/fix-memory-disabled-settings/spec.md` 2026-09-18）

## Files that change

- `docs/fix-memory-disabled-settings/{intent,spec,plan}.md`
- `src/features/settings/MemorySettings.tsx`：worktree extension 查询和控件禁用。
- `src/features/settings/MemorySettings.test.tsx`：关闭 pi-memory 回归测试。
- `src/features/settings/SettingsDialog.tsx`：传递 worktreeId。

## Order

1. 添加失败测试；
2. 实现 extension 状态查询；
3. 运行 targeted tests 与 `pnpm check`。

## Risks

- 全局 Memory 页面无 worktree 时不能误判为 disabled；
- extension 查询失败不能阻断已有 Memory 文档阅读；
- 不改变模型 API，避免把未认证/不可用模型混入选项。
