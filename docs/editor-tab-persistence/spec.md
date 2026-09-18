# Spec: Editor 与 Chat Tab 持久化
Status: accepted。 Implements: `docs/editor-tab-persistence/intent.md`。

## Storage

- key：`spirecode.editor-tabs.v1`。
- value：按 `worktreeId` 索引的 JSON 对象，包含 `tabs` 和 `activeTabId`。
- 只接受当前 schema 的有限字段；解析失败或字段非法时回退 `{}`。
- `terminal` tab 永不写入 storage；读取旧数据时也丢弃 terminal。

## Restore

- `useEditorStore` 初始化时读取持久化元数据。
- `open`、`keep`、`close`、`activate`、`setFileDirty` 等改变 tab metadata 的操作触发持久化。
- `clearWorktree` 删除对应持久化视图。
- 恢复的 file/diff/chat tab 使用稳定 resource ID；Chat tab 后续由现有 ChatView attach，文件/diff 由现有 ResourceView reload。
- activeTabId 不存在时回退最后一个 tab；没有 tabs 时为 null。

## Safety

- 恢复不接受 absolute path、`..` path component、未知 diff scope、空 worktree/session ID。
- file tab 的 dirty 永远恢复为 false；关闭前 dirty 保护只针对当前运行期间草稿。
- Terminal 不恢复，因为 terminalId 指向已结束的旧 Main runtime。

## Acceptance

- store 重置/重新创建后恢复 file、diff、chat tabs 和 active tab。
- Terminal tab 不被持久化或恢复。
- 非法 JSON/非法 tab 不阻断 store 初始化。
- clearWorktree 删除持久化数据。
- `pnpm check` 全绿。
