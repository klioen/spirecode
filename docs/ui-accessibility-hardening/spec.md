# Spec: Workbench UI accessibility and narrow-layout hardening
Status: accepted. Implements: `docs/ui-accessibility-hardening/intent.md`.

## 1. Editor tabs

- 每个 tab 使用非交互 container，内部为独立的 tab activation button 和 close button；不得嵌套 interactive element。
- tab list 使用 `role="tablist"`，activation 使用 `role="tab"`、`aria-selected` 和 roving `tabIndex`。
- close button 原生支持 Enter/Space；dirty 文件继续读取 store 最新状态并确认 discard。
- 关闭 active tab、double-click keep、terminal/chat cleanup 行为不变。

## 2. Modal focus and pending dismissal

- Settings 与 Worktree dialogs 打开时记录 `document.activeElement`，将焦点放入 modal；Tab/Shift+Tab 在可用控件间循环。
- Escape 和 backdrop 仅在 dismissible 时关闭；pending create/rename/delete 时忽略 dismissal。
- 卸载时若 opener 仍 connected，则恢复 focus。
- dialog 保持 `aria-modal=true` 和可关联标题；背景不接收 modal 键盘操作。

## 3. Branch combobox

- Input 继续使用 `role=combobox`、`aria-controls`、`aria-expanded`、`aria-autocomplete=list`。
- option 使用稳定 ID、`role=option`、`aria-selected`；input 通过 `aria-activedescendant` 指向 active option。
- ArrowDown/ArrowUp 循环或边界停止；Home/End 定位首尾；Enter 选择 active option；Escape 关闭且不提交。
- 输入变化重置 active option 到首个匹配项；鼠标行为保持。

## 4. Files and Changes trees

- 两个面板根容器使用 `role=tree`。
- 可见行使用 `role=treeitem`、`aria-level`、目录 `aria-expanded` 和单一 roving `tabIndex=0`。
- ArrowDown/ArrowUp 移动到相邻可见项；Home/End 首尾；Right 展开目录或进入第一个 child；Left 折叠目录或移动到 parent；Enter/Space 执行当前行默认动作。
- 焦点 ID 在刷新后不存在时回退首个可见项；不把所有行放入 Tab 顺序。
- 鼠标点击、文件打开、diff 打开和展开状态持久化语义不变。

## 5. Chat composer

- `.chat-composer-actions` 可在窄宽度换行；配置组 `min-width:0` 并允许 select 缩小。
- submit/stop 控件保持可见，不与 select 重叠。
- 宽屏视觉顺序和行为保持；不改变 textarea 键盘发送/IME 行为。

## 6. Acceptance

- HTML 不再包含 button 内嵌 role=button 的 tab close。
- modal focus trap、restore 和 pending dismissal 测试通过。
- combobox 与两个 tree 的完整键盘矩阵测试通过。
- composer 在 340px 容器的 DOM/CSS contract 测试证明可 wrap/shrink。
- `pnpm check`、生产 build、目标平台 bundle smoke 保持通过。
