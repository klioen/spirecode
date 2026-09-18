# Plan: 修复 Memory 文档区域被配置区挤压（from `docs/fix-memory-document-layout/spec.md` 2026-09-18）

## Files that change

- `docs/fix-memory-document-layout/{intent,spec,plan}.md`
- `src/styles/index.css`
- `src/styles/themeTokens.test.ts` 或 MemorySettings 测试：布局约束断言。

## Order

1. 添加 CSS token/layout 断言；
2. 调整 modal height、Memory overflow/flex 与小屏 media query；
3. 运行 targeted tests 和 `pnpm check`。

## Risks

- `:has()` 由当前 Electron Chromium 支持；不影响外部浏览器目标；
- 小屏幕不能使用固定高度导致不可滚动，因此必须保留 media fallback。
