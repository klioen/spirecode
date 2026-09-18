# Spec: Agent、Editor、Terminal Settings 控制面
Status: accepted。 Implements: `docs/settings-control-plane/intent.md`。

## Settings

Storage key `spirecode.settings.v1`：

```ts
{ editorFontSize: 13|14|16|18; wordWrap: "off"|"on"; terminalFontSize: 12|13|14|16; terminalScrollback: 1000|5000|10000|20000 }
```

非法或损坏值回退默认值。

## Agent

- 显示 `~/.pi/agent` 作为 pi 配置目录；这是静态说明，不读取目录内容。
- 显示“Agent tools and extensions run with the current user permissions.”
- `Copy config path` 使用现有受限 clipboard command；无凭据写入。

## Editor / Terminal

- Editor Font size select 和 Word wrap select 即时保存。
- EditorPane Monaco 使用设置值；现有编辑器实例配置更新。
- Terminal Font size、Scrollback select 即时保存；TerminalInstance 订阅设置并更新 xterm options。

## Acceptance

- 三个 section 不再显示 Coming Soon；
- 设置改变后 localStorage 写入限定 schema；重挂载后恢复；
- Monaco/xterm 接收对应值；
- `pnpm check` 全绿。
