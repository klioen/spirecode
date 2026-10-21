# Intent

Task 执行结束后，用户目前只能看到状态和更新时间，无法快速判断一次或多次执行总共花了多久、消耗了多少模型 token。列表和详情都需要展示任务级汇总指标，便于比较执行成本并定位异常任务。

风险判定：标准变更。它改变 Task 的 Main 到 Renderer 返回模型和用户可见 UI，但不修改持久化 schema、权限边界或公共外部 API。

# Spec

- Task 列表的每一项展示该任务所有运行记录累计的耗时和 token 消耗。
- Task 详情概览展示相同的任务级累计耗时和 token 消耗。
- 耗时按各 run 的执行墙钟时间累加：从 `startedAt` 开始；已结束 run 到 `finishedAt`，等待报告的 run 到 `settledAt`，正在运行的 run 到当前时间。尚未开始的 run 计为 0。
- token 消耗汇总 task run 所绑定 Pi session 中 assistant message，以及 `usage`、`compaction`、`branch_summary` 条目的模型用量；优先读取 `usage.totalTokens`，缺失时使用输入、输出、缓存读写 token 之和。缺失、已删除或暂不可读的 session 按 0 处理，不能阻断 Task 列表/详情。
- 指标使用当前语言环境格式化；大 token 数使用紧凑数字格式，耗时使用易读的日/时/分/秒格式。
- 不向 Renderer 暴露 session 文件路径，也不新增任意文件读取能力。

# Plan

1. 新增 Main 内部 session metrics 读取器和纯聚合逻辑，并用单元测试覆盖 token 解析、缓存及耗时边界。
2. 在 Chat domain 内安全解析 Pi session 文件路径，并扩展 Task 列表和详情的返回 DTO，加入 `durationMs`、`tokenCount`，在 Main 内从全部 run 时间戳和 session 文件计算。
3. 扩展 Renderer Task 类型、格式化工具、双语文案与列表/详情 UI。
4. 先补 UI 回归测试使新要求失败，再完成实现并运行 Task 针对性测试、类型检查和仓库检查。
