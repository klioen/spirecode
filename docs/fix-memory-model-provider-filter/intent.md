# Intent: Memory 模型列表移除已关闭 Provider
Author: product owner。 Status: accepted。

## Problem

Memory 设置的可选模型仍显示 TraeX，即使用户已关闭或移除 TraeX provider extension。ModelCatalogService 当前硬编码加载 `@bytedance-dev/pi-provider-traex`，导致模型列表与用户实际启用的 provider 不一致。

## Proposed outcome

删除 TraeX 专用 provider 注入逻辑，Memory 模型列表只使用当前 ModelRuntime 返回的可用模型。关闭 provider 后，该 provider 不再出现在可选模型中。

## Constraints

- 不为任何单一 provider 写死 extension 加载；
- 保留已有模型 DTO、认证和排序逻辑；
- 没有可用 provider 时仍显示空模型状态；
- 不自动修改已保存的 Memory 配置。
