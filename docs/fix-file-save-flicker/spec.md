# Spec: 保存响应与文件资源快照一致化
Status: draft。 Implements: `docs/fix-file-save-flicker/intent.md`。

## Requirements

1. 文件保存成功后，`ResourceView` 的 ready value 必须立即更新为 `fsWriteFile` 响应。
2. `FileView` 的 content、saved baseline、version 与父级 value 必须在保存完成后保持一致。
3. 从保存响应完成到 watcher 刷新完成期间，Monaco 不得渲染保存前内容。
4. 保存触发的 watcher invalidation 仍采用 stale-while-revalidate：继续显示已保存内容，后台读取当前 generation。
5. 保存失败或 `FILE_CONFLICT` 时继续保留本地 dirty buffer。
6. Git Diff 行为不变。

## Design

`ResourceView` 向 `FileView` 提供 `onSaved(saved: FileContent)` callback。保存成功时：

- 先把 saved value 写入当前 tab 的 generation-tagged resource cache；
- 通过 callback 将 `ResourceView` 的 load state 更新为 `{ status: "ready", value: saved }`；
- 更新 `FileView` 的 content、saved baseline 和 version，并清理 draft。

父级 prop 因此不再停留在旧 snapshot。后续 dirty=false 的同步 effect 即使运行，也只会同步相同 saved version，不会回退内容。watcher 增长 generation 后仍会后台 `fsReadFile`，已有 saved snapshot 继续显示。

## Regression test

扩展 `EditorPane` 文件保存测试，记录 mock Monaco 每次渲染收到的 `value`。在保存响应完成前清空记录；保存完成并清除 dirty 后，断言后续所有渲染值均为保存后的内容，且不包含保存前 baseline。

## Acceptance criteria

- 保存回归测试在修复前可稳定观察到旧值回退并失败。
- 修复后保存阶段 Monaco value 序列不包含旧内容。
- 现有编辑、dirty、冲突、切换标签和 Diff 测试全部通过。
- 完整 `pnpm check` 通过。

## Concerns

### Concern A: React state batching

不能依赖子组件多个 `setState` 的执行顺序；父级资源值必须显式更新，确保后续 prop 同步有一致来源。

### Concern B: watcher race

保存后 watcher 可能在 callback 前后到达。generation 标签与既有 navigation/generation gate 继续决定异步读取能否更新当前视图，saved snapshot 只作为 stale 内容保留。
