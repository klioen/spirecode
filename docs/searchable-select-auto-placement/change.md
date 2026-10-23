# SearchableSelect 自动翻转

## Intent

修复聊天输入区底部的 Model 与 Thinking Level 下拉列表向下展开后被视口裁剪的问题，同时让所有 `SearchableSelect` 使用方共享一致的视口感知定位行为。

风险判定：标准变更；它改变通用 UI 组件的可见定位行为并有多项回归验收条件，但不涉及安全边界、持久化格式、跨进程契约或不可逆操作。

## Spec

- 打开下拉框时读取触发按钮边界和当前视口高度。
- 下方空间小于完整弹出层预计高度时向上展开，否则保持向下展开。
- 弹出层打开期间在窗口 resize 或捕获阶段 scroll 后重新计算方向。
- 只改变弹出层位置；保留现有结构、ARIA、键盘导航、搜索、选择与外点关闭行为。
- 通过组件测试覆盖下方空间不足时向上和空间充足时向下。

## Plan

1. 先添加基于 mocked `getBoundingClientRect` 和视口高度的回归测试，并确认现有实现失败。
2. 在 `SearchableSelect` 中集中计算展开方向，在打开入口及打开期间的 resize/scroll 事件中调用。
3. 使用 modifier class 与 CSS 切换 `top`/`bottom`，不改动弹出层视觉样式。
4. 运行相关 Vitest、lint、typecheck 和仓库完整检查，检查最终 diff。
