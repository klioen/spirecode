# Intent: 扩展关闭后的 Chat 默认模型 fallback
Author: product owner。 Status: accepted。

## Problem

关闭 TraeX extension 后，SpireCode 仍从配置读取 TraeX 默认模型。由于该 provider 已不再可用，新建 Chat 直接报 `CHAT_MODEL_UNAVAILABLE / Configured agent model is unavailable`，而不是切换到当前可用模型。

## Proposed outcome

当配置的默认模型不存在或 provider 无认证时，Chat 初始化从当前 runtime 可用且已认证的模型中选择第一个作为 fallback。只有没有任何可用模型时，才返回原结构化错误。

## Constraints

- 不修改用户配置文件；
- 不伪造认证状态；
- 已有效的默认模型保持原有调用路径和选择结果；
- 需要覆盖 extension/provider 关闭后的回归测试。
