# Spec: SpireCode 双主题视觉系统
Status: accepted。 Implements: `docs/visual-theme-refresh/intent.md`。

## Theme model

支持 `system | light | dark` 三种用户设置，持久化到 `spirecode.appearance.v1`。根节点写入 `data-theme="light|dark"`，system 模式监听 `prefers-color-scheme`。

## Palette direction

### Light

- workspace：冷白、轻微蓝绿倾向
- sidebar/header：比 workspace 略深的浅青灰
- elevated：纯白或接近白色
- accent：低饱和蓝绿色，约 teal/cyan 方向
- selected：accent 的浅色 wash，不使用纯蓝大填充
- border：中性偏青灰，强边框显著高于背景

### Dark

- workspace：深蓝黑而不是纯黑灰
- sidebar/header：层级更深或更高，边界明确
- elevated：比 workspace 更亮一阶
- accent：低饱和浅绿色
- selected：浅绿透明 wash + 左侧/顶部 accent
- border：提高到肉眼可识别但不发白

## Semantic tokens

至少定义：

```text
--workspace-bg
--sidebar-bg
--header-bg
--content-bg
--terminal-bg
--elevated-bg
--control-bg
--control-hover
--control-selected
--border-muted
--border-default
--border-strong
--text-default
--text-muted
--text-subtle
--accent
--accent-hover
--accent-soft
--accent-muted
--danger
--warning
--success
--shadow
```

旧 `--bg/--surface/--line/--muted/--text/--bright/--accent-dim` 被新 token 替代，不保留两套来源。

## Component states

- Project selected：selected fill + accent icon + default text + 3px left indicator。
- Editor active tab：selected/elevated fill + accent top border；inactive tab 与 header 有明确边界。
- Files/Changes row：hover fill 提高，active/selected 可识别。
- Right tab selected：文字与 underline 均使用 accent，header 与 body 有清晰 border。
- Header controls：默认有轻边界或独立容器，hover/active 不只改变文字颜色。
- Resize handles：resting border 可见，hover/drag 使用 accent。
- Terminal：xterm 背景、前景、cursor、selection 从主题 token 读取。
- Monaco：根据主题切换 `vs`/`vs-dark`，并设置 workspace background、foreground、selection、line number、cursor。

## Theme control

右上角添加图标按钮，点击在 `system → light → dark → system` 循环。按钮 title/aria-label 显示当前模式和下一模式。系统模式下监听操作系统主题变化。

## Accessibility

- body text 与 resting surface 目标对比度 ≥ 4.5。
- muted text 目标 ≥ 3.0。
- selected/hover fill 与所在 surface 必须肉眼可区分。
- focus-visible 使用 2px accent ring，不只依赖颜色变化。

## Proof

- theme store 测试：持久化、system 响应、循环切换。
- component 测试：主题按钮和 `data-theme`。
- CSS token 测试：两个主题均定义完整 token，不在组件区域新增 raw hex。
- Monaco/xterm 主题 adapter 测试。
- `pnpm check`、`pnpm bundle`、浅色/深色窗口截图。
