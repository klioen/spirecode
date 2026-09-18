# Spec: pi-memory 关闭时禁用 Memory 设置
Status: accepted。 Implements: `docs/fix-memory-disabled-settings/intent.md`。

- MemorySettings 接收可选 `worktreeId`；SettingsDialog 传入当前 worktreeId。
- 有 worktree 时调用 `settingsApi.listExtensions(worktreeId)`。
- 找到 `name === "pi-memory"` 或 `displayPath`/id 对应 pi-memory 且 `enabled === false` 时，`memoryDisabled=true`。
- memoryDisabled 时：
  - Phase 1/2 Model、Reasoning select disabled；
  - Save disabled；
  - 显示 `Enable pi-memory to configure Memory settings.`。
- extension 查询失败不改变现有配置能力，但显示非阻断 warning。
- `memoryApi.listModels()` 的结果作为唯一模型选项来源，仍使用当前可用认证模型。
