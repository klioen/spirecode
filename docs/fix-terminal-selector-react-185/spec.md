# Spec: 修复 Terminal 空 snapshot 无限更新
Status: accepted。 Implements: `docs/fix-terminal-selector-react-185/intent.md`。

## Requirements

- Zustand selector 对相同 store state 必须返回引用稳定的空 Terminal 列表。
- 渲染一个无 Terminal tab 的 `TerminalPanel` 不得抛出 React maximum update depth 错误。
- 保留创建第一个 Terminal 的现有 UI。

## Design

在 Terminal store 模块定义只读共享空数组，并提供 project-scoped selector。组件使用该 selector，而不是在 selector 内创建 `[]`。

## Proof

组件回归测试渲染空 Terminal 面板并验证 New terminal 按钮存在；修复前测试因 React #185 失败，修复后通过。运行 `pnpm check` 和重新打包安装。
