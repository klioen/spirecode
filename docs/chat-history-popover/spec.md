# Spec: Chat history 轻量浮层

Status: approved，用户已确认。

## Requirements

1. 保留 History 入口及当前 worktree 的会话列表与打开行为。
2. 紧凑标题栏展示 Chat history、结果数量和关闭按钮；下方提供按标题本地过滤的搜索框。
3. 会话按更新时间降序，按 Today / Yesterday / Earlier 分组；缺少或无效时间的项归入 Earlier，不抛异常。
4. 列表项采用透明背景、轻量图标、单行省略标题、紧凑时间，hover/focus 提供主题化反馈。当前活动 Chat 会话具有视觉标记与可访问状态。
5. 加载、空历史、无搜索结果及错误状态均有明确展示；标题及搜索固定，仅列表滚动。
6. 外部 pointerdown、Escape、显式关闭、再次点击入口及选择会话均关闭浮层；点击内部或搜索不误关闭。
7. 切换 worktree 关闭浮层，避免旧上下文和过滤条件残留。
8. 非模态浮层：不拦截外部点击，不禁用或遮罩编辑器。打开时搜索获取焦点；Escape/关闭按钮回焦入口，外部点击及选择会话不抢焦点。

## Design

- `ChatHistory.tsx`：在现有加载/卸载保护基础上增加搜索、排序分组、紧凑时间、activeSessionId、关闭回调及必要可访问属性。
- `EditorPane.tsx`：管理入口与浮层 DOM 边界，只在打开时注册 document capture pointerdown 与键盘监听并清理；将入口排除在 outside 判断之外，避免 pointerdown 关闭后 click 重开。
- `src/styles/index.css`：仅更新 History 专属样式及入口展开态，使用现有主题 token，浮层宽高限制在父面板内。
- 保留既有 Chat API，不存储会话内容到 Zustand，不增加 npm 包。

## Concerns

- 捕获阶段 outside 监听必须明确排除浮层与入口，保证其他控件正常响应且入口可切换关闭。
- 日期分组使用本地日历日边界，避免跨午夜和夏令时以固定 24 小时划分造成错误。
- DOM 测试无法证明视觉质量；应通过可用的浏览器/Electron 截图检查明暗主题及窄面板，无法执行时明确披露。
