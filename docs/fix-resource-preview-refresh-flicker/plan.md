# Plan: 修复 AI 写代码时 Changes 资源预览闪烁（from `docs/fix-resource-preview-refresh-flicker/spec.md` 2026-09-15）

## Files that change

- `docs/fix-resource-preview-refresh-flicker/intent.md`：记录问题、目标和约束。
- `docs/fix-resource-preview-refresh-flicker/spec.md`：定义 stale-while-revalidate 行为与竞态要求。
- `docs/fix-resource-preview-refresh-flicker/plan.md`：记录实现顺序、风险和证明。
- `src/features/editor/EditorPane.test.tsx`：增加连续 Diff invalidation 不闪回 Loading 的回归测试。
- `src/features/editor/EditorPane.tsx`：使用带 generation 的缓存快照并在后台刷新期间保留已有内容。

## Order of work

1. 在 EditorPane 组件测试中复现 Diff 初次加载成功后 generation 更新、下一请求悬而未决的场景。
2. 运行目标测试，确认当前实现因显示 `Loading resource…` 而失败。
3. 将资源缓存值改为 `{ generation, value }`，移除 generation 更新时的整段缓存删除。
4. 调整加载状态转换：有 stale 内容时发起刷新但不切换 loading；仅接受当前导航和 generation 的响应。
5. 运行目标测试及完整 `pnpm check`，检查最终 diff。

## Risks

最危险的是把旧缓存当成新鲜内容，导致资源不再刷新；因此缓存必须携带 generation，generation 不匹配时始终发请求。另一个风险是旧异步响应覆盖新版本，继续用现有 generation 与 navigation 双重检查规避。没有选择降低 watcher 频率或 debounce Diff 刷新，因为那会降低 Changes 数据实时性，且不能从根本上避免任意失效时的视觉闪烁。

## Proof

- `pnpm test -- src/features/editor/EditorPane.test.tsx`
- `pnpm check`
