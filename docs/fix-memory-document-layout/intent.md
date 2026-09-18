# Intent: 修复 Memory 文档区域被配置区挤压
Author: product owner。 Status: accepted。

## Problem

Phase 1 / Phase 2 配置改为两行后，560px 高的 Settings modal 中 `memory_summary.md` 和 `MEMORY.md` 阅读区域被明显压缩。外层 settings-content 与内层 document 同时参与滚动，剩余高度分配不稳定。

## Proposed outcome

扩大 Settings 可用高度，并让 Memory 页面使用固定 header/config/tabs + 剩余高度 document 的布局；文档内容独立滚动，在小屏幕下仍可完整访问。

## Constraints

- 不改变 Phase 1 / Phase 2 两行配置；
- 不改变其他 Settings section 的滚动行为；
- modal 仍受视口边界限制。
