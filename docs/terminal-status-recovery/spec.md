# Spec: Terminal 退出状态可见性与重启
Status: accepted。 Implements: `docs/terminal-status-recovery/intent.md`。

## 1. Tab 标记

- `type: "terminal"` 的 tab 在 `status !== "running"` 时，在标题旁显示小写状态标记（`exited` / `error`）。
- 标记不替换标题、不参与 preview/dirty 语义。

## 2. 状态横幅

- 活动的 terminal tab 且 `status !== "running"` 时，终端视图上方渲染：
  - `role="status"` 横幅；
  - 文案：`Process exited.`（exited）或 `Process failed.`（error）；
  - `Restart` 按钮。
- 横幅随状态恢复/切换自动消失。

## 3. Restart 行为

1. `terminal_close(oldId, force=true)`；`TERMINAL_NOT_FOUND` 视为已清理，其余错误中断并提示；
2. `terminalStream.close(oldId)`；
3. 从 editor store 关闭旧 tab；
4. 走现有 `createTerminal()` 创建新终端并激活。
5. 关闭失败的错误走全局错误 surface，不留下半清理的 tab。

## 4. 验收

- exited/error 的 tab 显示状态标记；running 不显示。
- 活动非 running 终端显示横幅与 Restart。
- Restart 后：旧 terminalId 被 force close、旧 tab 移除、新终端 tab 创建并激活。
- close 抛出非 NOT_FOUND 错误时 tab 保留并显示错误。
- `pnpm check` 全绿。

## 5. Concerns

- Restart 创建的新 tab 编号递增（`Terminal2`…），与现有编号语义一致，不做编号复用。
