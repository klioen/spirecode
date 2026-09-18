# Spec: 编辑器空状态补充 Chat Agent 提示
Status: accepted。 Implements: `docs/editor-empty-hints/intent.md`。

- `EditorPane` 无 active resource tab 时，在现有 Terminal hint 后显示：`Open a Chat Agent from the tab header`。
- 使用与 Terminal hint 相同的 icon/text 结构。
- 不显示不存在的快捷键，不增加额外按钮。
- `EditorPane` 测试必须验证该文案。
