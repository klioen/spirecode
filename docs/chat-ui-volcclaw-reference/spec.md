# Spec: 参考 VolcClaw 的 Chat Renderer 视觉与交互
Status: draft。 Implements: `docs/chat-ui-volcclaw-reference/intent.md`。

## 1. Scope

### Included

- Chat transcript、空状态、加载/重连/失败状态的前端呈现。
- Composer 自适应高度、聚焦态、发送/停止图标按钮、字节限制与错误反馈。
- user/assistant/error 消息的文档流布局、Assistant Markdown 和流式指示。
- “深度思考”的运行/完成状态、默认折叠交互与流式视觉反馈。
- 相邻 Tool timeline item 的前端分组、默认折叠摘要，以及逐项参数/结果展开。
- queue 和 retry/compaction/error notice 的视觉整理。
- Chat 组件测试和样式响应式处理。

### Excluded

- `electron/` 下任何代码、IPC、preload、Main Chat domain 和 pi SDK 行为。
- `chatApi.ts`、`hostChatApi.ts`、`chatRuntime.ts`、`sessionReducer.ts` 的协议或状态语义变化。
- 新增附件、富文本编辑器、模型/Thinking mode selector、消息操作栏。
- 原始 HTML、远程图片/媒体增强、代码语法高亮、数学公式渲染。
- 复制 VolcClaw 私有 UI 包；仅允许为 Markdown 增加固定版本的独立开源依赖。

## 2. Reference decisions

从 VolcClaw `packages/chat-ui` 复用交互思想而非源码依赖：

- `sender-composer.tsx`：大圆角输入容器、输入区和 footer 分层、running 时发送按钮切换 Stop、内容驱动禁用态。
- `thread/thread.tsx` 与 `markdown/markdown-text.tsx`：user 气泡 + assistant Markdown 文档流；流式正文使用轻量尾部指示而非单独 `Streaming…` 文本。
- `message/reasoning.tsx`：Thinking 是带状态图标和 chevron 的“深度思考”折叠区。
- `tools/execution-card.tsx` / `tools/fallback.tsx`：多个工具调用先形成默认折叠的执行组，展开组后再逐项查看工具名、入参和输出。

SpireCode 不采用 VolcClaw 的白色硬编码、Tailwind class、Arco Collapse、虚拟列表或内部 ChatKit controller；所有实现映射到现有主题 token 和原生 React/HTML。

## 3. Component behavior

### ChatView

- transcript 内增加语义化状态/空状态容器，不改变 attach/send/abort 调用。
- 在 Renderer 内对 timeline 做纯展示投影：每一段连续的 `tool` item 聚合为一个 Tool group；message、thinking 或 notice 会终止当前分组。原始 runtime state、item 顺序和后端事件完全不变。
- 单项 Tool 也进入同一分组组件，因此摘要一致显示“已执行 1 项操作”。
- 分组中任一 Tool 为 running 时摘要显示“正在执行 X 项操作”；全部结束后显示“已执行 X 项操作”；存在 error 时同时给出失败状态。
- Composer 保持 transcript 下方独立布局，不遮挡中央 Tab 内容。

### ChatMessage / Markdown

- user 为右对齐浅色气泡，不显示冗余 `user` header；用户文本继续按纯文本和换行展示，不解析 Markdown。
- assistant 为全宽无外框 Markdown 文档流，通过小型 Agent 标识建立来源层级。
- 使用固定版本的 `react-markdown` 与 `remark-gfm`；不启用 `rehype-raw`，消息中的 HTML 作为普通文本处理。
- 支持段落、标题、强调、链接、列表、引用、分隔线、表格、行内代码和 fenced code block；代码块使用 CSS 展示，不在本次引入 Shiki。
- 链接使用安全属性，禁止 `javascript:` 等不安全协议；图片不在本次渲染能力内。
- streaming assistant 在 Markdown 正文之后显示 pulse cursor；保留可访问的 `Streaming` label。
- error 使用现有 danger token。

### ThinkingBlock

- 标题固定显示“深度思考”；running 状态通过图标动画表达，但不改变标题语义。
- 默认始终折叠，包括 streaming 状态；只有用户主动点击才展开。
- `defaultOpen` 仍作为显式测试/复用入口，但 ChatView 不传入开启值。
- 内容采用次级文字和独立换行规则，不解析 Markdown。

### ToolGroup / Tool detail

- 新增前端 Tool group 组件，接收一段连续 Tool item，外层默认折叠。
- 外层摘要显示“正在执行 X 项操作”或“已执行 X 项操作”；失败时显示失败数量或失败状态；包含状态图标和 chevron。
- 展开外层后按原 timeline 顺序展示每个工具调用。每项显示工具名与 running/done/error 状态，并可继续展开详细信息。
- 每个工具详情默认折叠；展开后分“入参”和“输出”展示。错误进入“错误”数据块。
- 保持 generic unknown-tool renderer 和每个值 16,000 字符截断；对象通过格式化 JSON 展示，`undefined` 不生成空面板。
- running 使用旋转状态图标；done/error 使用 success/danger 色。

### ChatComposer

- textarea 根据内容自动增长，限制在合理最大高度后内部滚动；用户手动 resize 不再作为主要交互。
- footer 左侧显示键盘提示；接近或超过限制时才突出字节计数，避免常态噪声。
- 发送按钮为圆形 icon button，running 且草稿为空时显示 Stop；running 且有草稿时仍允许 Follow up。
- Stop 和 Send 均保留明确 `aria-label`，现有测试与键盘行为不变。
- queue 作为 Composer 上方紧凑 pending strip 呈现。

## 4. Styling

- Chat thread 最大宽度从当前 760px 调整为约 820px，Composer 与 thread 同轴。
- 使用现有 `--workspace-*`、`--control-*`、`--border-*`、`--text-*`、`--accent-*` token，兼容 light/dark。
- 新增 Chat 局部 motion：stream pulse、tool spinner、chevron/边框过渡；`prefers-reduced-motion` 下关闭动画。
- 窄窗口下保留 16px 左右安全边距，Tool/Thinking 展开内容不造成水平溢出。

## 5. Compatibility boundary

Wire data shape、runtime store、reducer、API 和 Main 均不变化。Tool 分组是 ChatView 中的派生展示结构，不写回 runtime。UI 只消费现有字段：

- message: `role/content/status`
- thinking: `content/status`
- tool: `name/arguments/result/error/status`
- session: `status/items/queue/error`

因此本次变更不需要后端协作，也不会改变历史 transcript hydration。

## 6. Proof

Focused:

```bash
pnpm test -- src/features/chat/ChatComposer.test.tsx src/features/chat/ChatView.test.tsx
pnpm typecheck
```

Full:

```bash
pnpm check
```

Required assertions:

- assistant 的 GFM Markdown 和 fenced code block 正确展示，原始 HTML 不执行；
- running assistant 具有可访问 Streaming 状态；
- “深度思考”在 running 和 complete 两种状态下均默认折叠；
- 一项和多项连续 Tool 均聚合，摘要计数正确，展开后可查看每项工具名、入参、输出和错误；
- message/thinking/notice 能正确切断 Tool group，顺序不改变；
- Composer 自动增长，Enter/Shift+Enter/IME、Follow up、Stop、64 KiB 行为不回退；
- diff 中没有 `electron/` 或 backend 文件变化。

## 7. Concerns

- 原生 `<details>` 的动画能力有限；优先保证稳定，不为了完全复刻 VolcClaw 引入 Collapse 组件库。
- 流式 Markdown 可能暂时出现未闭合语法；Renderer 必须对每个最新 canonical content 容错，不维护第二套增量 Markdown 状态。
- Markdown 禁止原始 HTML，并限制链接协议；本次不加载远程图片，避免引入额外网络与隐私行为。
- 当前 transcript 未虚拟化；视觉改造不扩大数据保留范围，也不在本次解决超长会话渲染性能。
