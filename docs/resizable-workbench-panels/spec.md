# Spec: 可拖拽 Workbench Panels
Status: accepted。 Implements: `docs/resizable-workbench-panels/intent.md`。

## Requirements

- Projects panel 右边缘显示水平 resize handle，宽度范围 160–360px，默认 220px。
- Files/Changes panel 左边缘显示水平 resize handle，宽度范围 220–520px，默认 292px。
- Terminal panel 上边缘显示垂直 resize handle，高度范围 120px 到窗口高度的 60%，默认 226px。
- 拖动使用 Pointer Events 和 pointer capture；pointer up/cancel 后停止。
- panel 尺寸通过 CSS custom properties 驱动 Grid，不在拖动时生成动态样式表。
- 尺寸和折叠状态保存在 localStorage；非法、过期或越界值回退并 clamp。
- 折叠中的 panel 不显示或不响应对应 resize handle。
- handle 提供 `role="separator"`、方向、当前值、最小值和最大值，支持键盘方向键每次调整 8px。
- 双击 handle 恢复该 panel 默认尺寸。

## Design

新增通用 `PanelResizeHandle`：接收 orientation、value、min、max 和拖动方向。Pointer down 时记录起始坐标和尺寸，window pointermove 计算新值，pointerup/cancel 清理。Workbench store 负责 clamp、持久化和 reset。Workbench 根节点设置：

```text
--projects-width
--right-panel-width
--terminal-height
```

CSS Grid 从 custom properties 读取。中央 Editor 使用 `minmax(340px, 1fr)`。

## State

```text
projectsWidth: number
rightPanelWidth: number
terminalHeight: number
rightCollapsed: boolean
terminalCollapsed: boolean
```

storage key: `pi-app.workbench.v1`。

## Proof

- Store 测试：默认值、clamp、持久化 hydration、reset。
- Handle 测试：pointer drag、键盘调整、双击 reset、ARIA。
- Workbench 测试：三个 handle 存在，折叠后对应 handle 隐藏。
- 完整 `pnpm check` 和 `pnpm bundle`。
