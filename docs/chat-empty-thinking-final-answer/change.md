# Chat empty thinking final-answer fix

## Intent

部分 Pi 会话的最终 assistant 消息在正文之后附带一个空 `thinking` block。Chat 时间线把这个空 block 当成正文后的工作步骤，因而误判正文不是 final answer，并将正文折叠进 Work Summary。修复后最终答案应始终直接可见，同时保留非空 thinking block 的原始顺序。

## Spec

- 历史会话快照归一化时忽略内容为空或仅含空白的 thinking block。
- 实时消息事件归一化时遵循相同规则，避免刷新前后表现不一致。
- 非空 thinking、text、tool call 的顺序和既有行为保持不变。
- 添加覆盖“final text 后跟空 thinking”的回归测试。

## Plan

1. 用示例会话的数据形态补充 wire normalization 回归测试，并确认修复前失败。
2. 在历史消息和实时事件两条归一化路径过滤空 thinking block。
3. 运行 Chat wire 定向测试、完整项目检查及 diff 检查。

风险判定：标准变更；该修复改变用户可见的 Chat 展示行为，但局限于 wire normalization，不涉及持久化格式、跨进程契约或安全边界。
