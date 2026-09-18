# Spec: 文件保存冲突恢复
Status: accepted。 Implements: `docs/file-conflict-recovery/intent.md`。

## Conflict UI

当 `saveError.code === FILE_CONFLICT` 时，在错误区域显示：

- 错误消息；
- `Reload`、`Compare`、`Overwrite` 按钮。

其他保存错误继续只显示错误信息，不显示误导性的冲突操作。

## Actions

- Reload：调用 `fsReadFile(worktreeId, relativePath)`；成功后替换 content/savedContent/version，清除 draft、dirty 和 error；失败保留 draft 并更新 error。
- Compare：调用 `fsReadFile`；成功后在当前编辑器下方显示只读磁盘版本摘要/内容，保留本地 content、version 和 dirty；失败更新 error。
- Overwrite：先调用 `fsReadFile` 获取最新 `version`，再调用 `fsWriteFile` 使用本地 content + 最新 version；成功后清除 dirty/error；失败继续保留 draft。
- 任一 action pending 时禁用三个动作和保存快捷键，显示 `Loading…` 状态。

## Safety

- Overwrite 不调用没有 expectedVersion 的 API，不修改 Main 校验。
- Compare 结果为组件局部 state，不进入 Zustand/localStorage。
- Reload 是显式丢弃本地 draft 的动作，按钮文案必须明确。

## Acceptance

- FILE_CONFLICT 后三个操作可见；普通错误不显示。
- Reload 恢复磁盘内容并清除 dirty。
- Compare 展示磁盘内容且保留本地 draft。
- Overwrite 先读最新版本再写入，成功清除 dirty。
- action 失败保留本地 draft。
- `pnpm check` 全绿。
