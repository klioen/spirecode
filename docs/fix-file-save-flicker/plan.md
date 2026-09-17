# Plan: 修复文件保存后的编辑器闪烁（from `docs/fix-file-save-flicker/spec.md` 2026-09-17）

## Files that change

- `docs/fix-file-save-flicker/{intent,spec,plan}.md` — bug 证据、设计和验证计划。
- `src/features/editor/EditorPane.test.tsx` — 增加保存后 Monaco 不得渲染旧 baseline 的回归测试。
- `src/features/editor/EditorPane.tsx` — 保存成功时同步更新父级 resource snapshot。

## Order of work

1. 在 Monaco mock 中记录文件编辑器收到的 value 序列。
2. 扩展现有保存测试：保存完成前清空记录，完成后断言没有旧内容；运行并确认 red。
3. 提交失败测试，固定复现证据。
4. 从 `ResourceView` 向 `FileView` 传递 `onSaved`，保存成功时同步 parent load state、cache 和局部 baseline。
5. 运行 EditorPane 定向测试与 Renderer typecheck。
6. 运行完整 `pnpm check`，审查 diff，构建并重新安装应用。

## Risks

- **最大风险：异步旧响应覆盖保存结果。** 保留现有 navigation/resource generation gate；保存 callback 仅作用于当前挂载 tab。
- **潜在风险：保存与 watcher 同时到达。** cache 继续带 generation；失效后后台刷新但保留 saved snapshot。
- **放弃方案：dirty=false 时跳过一次 prop 同步。** 这是时序补丁，无法建立父子资源一致性，后续其他 rerender 仍可能回退。
- **放弃方案：保存时临时隐藏 Monaco。** 只掩盖闪烁并产生新的视觉跳变。

## Proof

```bash
pnpm exec vitest run src/features/editor/EditorPane.test.tsx
pnpm typecheck
pnpm check
pnpm bundle
./scripts/smoke-app.sh /Applications/SpireCode.app
```

人工 smoke：编辑文本文件，连续保存多次，确认内容、光标区域与编辑器画面不闪回旧版本。

## Approval

待用户确认本计划后开始修改产品代码。
