# Spec: Changes 预览使用 stale-while-revalidate
Status: accepted。 Implements: `docs/fix-resource-preview-refresh-flicker/intent.md`。

## Requirements

- 首次打开且无缓存的文件或 Diff 时显示 `Loading resource…`。
- 已成功显示的资源失效时，刷新期间继续显示现有内容，不切回全屏 Loading。
- 刷新成功后只应用当前 generation 的结果；旧 generation 的响应不得覆盖新内容。
- 缓存必须记录内容对应的 generation，不能把过期内容误认为当前版本而跳过刷新。
- 文件正文和 Diff 正文继续只保存在组件状态或进程内缓存，不进入 Zustand。
- 读取失败时：没有旧内容则显示错误；已有旧内容则不得用加载态造成闪烁。

## Design

将 `ResourceCache` 的值扩展为带 generation 的快照。`ResourceView` 初始化时可使用任意缓存快照作为 stale 内容；effect 仅在快照 generation 等于当前 generation 时直接复用，否则发起后台请求。后台请求期间，仅当没有可显示内容时进入 loading。请求成功且 generation、导航仍有效时，写入当前 generation 快照并更新视图。

缓存不再在每次 worktree generation 增长时按前缀整体删除；generation 标签负责判定新鲜度，旧值只用于刷新期间维持稳定画面。

## Proof

组件回归测试先加载一版 Diff，再触发连续 invalidation，并断言新请求未完成时旧 Diff 仍在且 `Loading resource…` 不出现；完成后断言更新到新 Diff。运行目标测试与 `pnpm check`。
