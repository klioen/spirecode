# Spec: 可拖拽 Workbench Side Panels
Status: accepted。 Implements: `docs/resizable-workbench-panels/intent.md`。

> Terminal 底部 panel 已被 `docs/terminal-center-tabs/` 取代；本规格当前仅约束左右侧栏。

## Requirements

- Projects panel 右边缘显示 resize handle，宽度范围 160–360px，默认 220px。
- Files/Changes panel 左边缘显示 resize handle，宽度范围 220–520px，默认 292px。
- 拖动使用 Pointer Events 和 pointer capture；pointer up/cancel 后停止。
- panel 尺寸通过 CSS custom properties 驱动 Grid。
- 尺寸和右栏折叠状态保存在 localStorage；非法、过期或越界值回退并 clamp。
- 折叠右栏时不显示对应 resize handle。
- handle 提供 `role="separator"`、方向、当前值、最小值和最大值，支持键盘左右方向键每次调整 8px。
- 双击 handle 恢复该 panel 默认尺寸。

## Design

`PanelResizeHandle` 接收 value、min、max 和拖动方向。Pointer down 时记录起始 X 坐标和尺寸，window pointermove 计算新值，pointerup/cancel 清理。Workbench store 负责 clamp、持久化和 reset。Workbench 根节点设置：

```text
--projects-width
--right-panel-width
```

中央 Editor/Terminal tabs 使用 `minmax(340px, 1fr)`。

## State

```text
projectsWidth: number
rightPanelWidth: number
rightCollapsed: boolean
```

storage key: `spirecode.workbench.v1`。旧 terminal 字段被忽略且不再写回。

## Proof

- Store 测试：默认值、clamp、持久化和 reset。
- Handle 测试：pointer drag、键盘调整、双击 reset、ARIA。
- Workbench 测试：左右 handle 存在，右栏折叠后对应 handle 隐藏，不存在 Terminal handle。
- 完整 `pnpm check` 和 `pnpm bundle`。
