# Intent: Terminal 作为中央一等资源 Tab
Author: keliangliang。 Status: accepted。

## Problem

当前 Terminal 被固定在底部辅助 panel，拥有独立于文件/diff 的第二套 tab 系统。它占用固定布局区域，也无法像文件和 diff 一样在中央主工作区切换，不符合 Terminal 作为一等开发资源的定位。

## Proposed outcome

移除底部 Terminal panel。中央主 panel header 右侧增加 New Terminal 图标；点击后创建真实 PTY，并在中央 tab strip 新增 Terminal tab。Terminal 与 file/diff 共用激活、顺序和关闭模型，可同时打开多个，按 `Terminal 1`、`Terminal 2` 递增命名。

## Affected users and systems

中央 Editor tabs、Terminal UI/状态、Workbench Grid、panel resize 状态和 PTY 生命周期。

## Constraints

- Terminal tab 属于当前 project，不跨 project 混用。
- 每个 project 独立递增编号；关闭后不重用编号，避免名称跳动。
- 关闭 Terminal tab 必须终止对应 PTY、清理 stream 和 xterm instance。
- file/diff 关闭不影响后端资源。
- 不保留隐藏的底部 Terminal panel 或第二套 Terminal tab store。
- Projects 和 Files/Changes panel 继续可调整宽度；Terminal 高度状态和 resize handle 删除。

## Open questions

无。
