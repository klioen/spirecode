# Spec: 修复 Memory 文档区域被配置区挤压
Status: accepted。 Implements: `docs/fix-memory-document-layout/intent.md`。

- Settings dialog desktop height 从 560px 调整为 680px，最大不超过 `100vh - 48px`。
- `.settings-content:has(.memory-settings)` 使用 `overflow: hidden`，由 Memory 子布局管理高度。
- `.memory-settings`、`.memory-document`、`.memory-document-content` 保持 `min-height: 0` 与 flex 剩余高度。
- Memory config/tabs 不收缩，document flex:1。
- 低高度视口（max-height: 720px）恢复外层滚动，并为 document content 设置至少 220px 高度。
