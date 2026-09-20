# Intent: Workbench UI accessibility and narrow-layout hardening
Author: product owner. Status: accepted.

## Problem

SpireCode 的主要桌面流程可用，但五类界面交互仍影响键盘用户、辅助技术和窄窗口使用：Editor tab 的关闭控件嵌套在另一个 button 中；Settings 与 Worktree 自定义 modal 未完整管理焦点，且异步操作期间可被误关闭；分支 combobox 只支持鼠标；Files 与 Changes 只具有视觉树形结构；Chat composer 在工作区被两侧面板压缩时可能溢出。

## Proposed outcome

1. Editor tab 选择和关闭是合法、独立、键盘可操作的控件，dirty 确认保持不变。
2. Settings/Worktree dialog 打开后焦点停留在 modal 内，关闭后恢复到触发控件；pending mutation 不允许通过 Escape/背景点击误关闭。
3. Worktree branch combobox 支持 ArrowUp/ArrowDown/Home/End/Enter/Escape，并暴露正确 ARIA active option。
4. Files 与 Changes 提供标准 tree/treeitem 语义、roving tabindex 和 Up/Down/Left/Right/Home/End 导航。
5. Chat composer 在最小 editor 宽度下不重叠、不横向溢出，模型/思考选择和发送控件仍可操作。

## Affected users and systems

- 仅使用键盘或屏幕阅读器的用户。
- 在窄窗口或同时展开左右面板的用户。
- Editor、Settings、Worktree、Files、Changes、Chat composer 组件和样式。

## Constraints

- 不改变 Main/IPC/文件/Git/Agent 权限边界。
- 不引入新的 UI 依赖；复用现有 React、DOM 与样式体系。
- 不改变已批准的业务语义、数据结构、Worktree mutation 或 Chat session 行为。
- 异步操作失败仍必须在原 dialog 内可见。
- 所有新增交互需有组件级回归测试，并保持中英文文案一致。

## Open questions

None. 用户已批准按 Editor tabs → dialogs → combobox → trees → composer 的顺序全部实施。
