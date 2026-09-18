# Spec: Memory 模型列表移除已关闭 Provider
Status: accepted。 Implements: `docs/fix-memory-model-provider-filter/intent.md`。

- `createCatalogRuntime` 只创建 `ModelRuntime({ modelsPath: null })` 并返回 runtime。
- 删除 TraeX package resolution、`createAgentSessionServices` provider 注入及相关 imports/helper。
- `ModelCatalogService.list()` 的 provider 集合完全由 runtime.getAvailable() 决定。
- 测试证明 runtime 返回的模型原样转换；不再测试或依赖 TraeX 注入。
- `pnpm check` 全绿。
