# Spec: Terminal 中央资源 Tabs
Status: accepted。 Implements: `docs/terminal-center-tabs/intent.md`。

## Requirements

- 中央 tab header 右侧提供图标按钮，accessible name 为 `New terminal`。
- 点击按钮依次调用 `terminal_create` 和 `terminal_attach`，成功后打开并激活中央 Terminal tab。
- Terminal tab 名称按项目独立编号：`Terminal1`、`Terminal2`……；关闭后编号不回退。
- 中央 tab union 增加：

```text
{
  type: "terminal"
  id: "terminal:<projectId>:<terminalId>"
  projectId
  terminalId
  title
  status
  preview: false
}
```

- Terminal tab 不参与 preview replacement。
- Terminal tab 内容使用现有 `TerminalInstance`，占满中央内容区。
- PTY exit/error 更新 tab 状态，但不自动关闭 tab。
- 关闭 Terminal tab：force close PTY、关闭 stream、dispose xterm、再从中央 store 删除；后端已退出或不存在时仍完成 UI 清理。
- 创建成功但 attach 失败时必须主动 force close 新建 PTY，避免泄漏。
- Terminal 创建/关闭失败使用现有全局错误 surface，不仅写 console。
- 移除 `TerminalPanel`、Terminal 独立 tab store、底部 panel DOM、Terminal 折叠按钮、Terminal 高度/持久化/resize handle。
- Projects 和右栏 resize 继续工作。

## Ownership

`editorStore` 成为中央 resource placement 的唯一所有者；Terminal output 仍由 `terminalStream` 直接送到 xterm，不进入 Zustand。状态字段 `status` 存在于 terminal ResourceTab，仅用于 tab glyph。

## Error handling

Terminal 创建失败写入现有全局错误 surface，而不是仅 `console.error`。关闭失败也清理已不存在的 terminal；其他错误保留 tab 并提示。

## Proof

- Store 测试：多个 Terminal 编号、与 preview file 共存、关闭 fallback。
- EditorPane 测试：New Terminal 按钮、创建/attach 顺序、Terminal tab 渲染、关闭清理。
- Workbench 测试：无底部 panel/Terminal resize handle，左右 resize handle 保留。
- `pnpm check`、`pnpm bundle`、安装启动 smoke。
