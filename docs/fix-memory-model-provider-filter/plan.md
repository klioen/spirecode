# Plan: Memory 模型列表移除已关闭 Provider（from `docs/fix-memory-model-provider-filter/spec.md` 2026-09-18）

## Files that change

- `docs/fix-memory-model-provider-filter/{intent,spec,plan}.md`
- `electron/domains/models/modelCatalog.ts`
- `electron/domains/models/modelCatalog.test.ts`

## Order

1. 更新模型目录回归测试，确保不存在专用 TraeX 注入；
2. 删除硬编码 provider extension 加载；
3. 运行 model catalog targeted test 与 `pnpm check`。

## Risks

- 已认证模型目录仍由 pi runtime 自身提供；不能把 extension settings 过滤逻辑放在 Renderer；
- 删除用户配置中的默认模型不在本批范围内，避免隐式修改配置。
