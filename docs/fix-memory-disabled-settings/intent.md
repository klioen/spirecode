# Intent: pi-memory 关闭时禁用 Memory 设置
Author: product owner。 Status: accepted。

## Problem

用户关闭 `pi-memory` extension 后，Settings > Memory 仍允许选择 Phase 1/2 模型并保存，造成配置看似可写但运行时不可用。

## Proposed outcome

MemorySettings 根据当前 worktree 的 extension catalog 判断 `pi-memory` 是否启用：关闭时禁用模型、reasoning 和 Save 控件，并显示说明。模型选择继续只使用当前 ModelCatalog 返回的可用认证模型。

## Constraints

- 不自动重新启用 pi-memory；
- 不修改用户 extension 开关；
- 无 active worktree 时保持现有全局 Memory 文档/配置可见；
- 复用现有 settings_extensions_list 和 settingsApi。
