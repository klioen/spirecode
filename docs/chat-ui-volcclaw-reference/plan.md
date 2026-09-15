# Plan: 参考 VolcClaw 重设计 Chat 前端（from `docs/chat-ui-volcclaw-reference/spec.md` 2026-09-15）

## Files that change

### SDLC artifacts

- Modify `docs/chat-ui-volcclaw-reference/intent.md` — 记录已确认的“深度思考”、工具聚合和 Markdown 边界。
- Modify `docs/chat-ui-volcclaw-reference/spec.md` — 固化纯前端分组算法、折叠默认值和 Markdown 安全边界。
- Add `docs/chat-ui-volcclaw-reference/plan.md` — 本实施计划。

### Dependencies

- Modify `package.json` — 固定版本新增 `react-markdown`、`remark-gfm`，不引入 VolcClaw 私有 UI 包、Arco 或 Shiki。
- Modify `pnpm-lock.yaml` — 锁定 Markdown Renderer 依赖闭包。

### Chat Renderer

- Add `src/features/chat/MarkdownContent.tsx` — Assistant GFM Markdown Renderer；自定义安全链接、代码块和表格元素；不解析原始 HTML、不渲染远程图片。
- Modify `src/features/chat/ChatMessage.tsx` — user 纯文本气泡、assistant Markdown 文档流、error 状态和流式 cursor。
- Modify `src/features/chat/ThinkingBlock.tsx` — 标题改为“深度思考”，streaming/complete 均默认折叠，增加状态图标和可访问状态。
- Add `src/features/chat/ToolGroup.tsx` — 默认折叠的“正在执行/已执行 X 项操作”；展开后逐项展示工具，并允许继续展开入参、输出或错误。
- Modify `src/features/chat/ToolCard.tsx` — 变为 ToolGroup 内的单项详情 Renderer，保留 unknown tool 和截断行为。
- Modify `src/features/chat/ChatView.tsx` — 仅在 render projection 中把连续 Tool item 分组，遇到 message/thinking/notice 即切断；不修改 runtime state。
- Modify `src/features/chat/ChatComposer.tsx` — textarea 自动增长、图标化 Send/Stop、紧凑 queue 和低噪声字节提示；保留现有发送语义。
- Modify `src/features/chat/index.ts` — 导出新增的前端组件（如测试或现有模块需要）。
- Modify `src/styles/index.css` — Markdown typography、代码块、表格、Thinking、Tool group/detail、Composer、流式动画、响应式和 reduced-motion。

### Tests

- Add `src/features/chat/MarkdownContent.test.tsx` — GFM、代码块、安全链接、原始 HTML 不执行。
- Add `src/features/chat/ToolGroup.test.tsx` — 单项/多项计数、默认折叠、running/done/error、入参/输出与截断。
- Modify `src/features/chat/ChatView.test.tsx` — Tool 连续分组与边界切断、深度思考默认折叠、Assistant Markdown。
- Modify `src/features/chat/ChatComposer.test.tsx` — 保留 Enter/Shift+Enter/IME/Stop/限制测试，并覆盖自动增长及按钮可访问名称。

明确不修改：`electron/**`、preload、IPC、`chatApi.ts`、`hostChatApi.ts`、`chatRuntime.ts`、`sessionReducer.ts` 和 wire types。

## Order of work

1. **先固定前端行为测试**
   - 为 Markdown、Thinking 默认折叠、Tool 连续分组与计数添加失败测试。
   - Tool 分组用一项、多项、被 message/thinking/notice 切断、running 和 error 五类 fixture。
   - 保留既有 Composer 行为测试，避免视觉重构改变发送语义。

2. **引入最小 Markdown Renderer**
   - 固定版本安装 `react-markdown` 和 `remark-gfm` 并更新 lockfile。
   - 实现 `MarkdownContent`：GFM、代码块、表格、引用、列表和安全外链。
   - 不使用 `rehype-raw`；不增加图片、Shiki、KaTeX 或 VolcClaw 内部依赖。
   - 将 Markdown 只用于 assistant；user 保持纯文本，避免用户内容视觉语义变化。

3. **实现 timeline 的纯前端 Tool 分组**
   - 在 ChatView 层实现一个纯函数，将连续 Tool item 投影成 Tool group，其余 item 原样保序。
   - 不修改 `ChatTimelineItem`、reducer、snapshot 或事件协议。
   - group key 由首尾稳定 `toolCallId` 组成，流式更新时保持 React identity。

4. **实现折叠层级**
   - ToolGroup 外层默认折叠，摘要显示“正在执行 X 项操作”或“已执行 X 项操作”。
   - 展开后每个 ToolCard 仍默认折叠；用户点击后显示入参和输出/错误。
   - Thinking 标题为“深度思考”，streaming/complete 均默认折叠，不做自动展开。
   - 使用原生 `details` 和现有 Remix Icon，保持键盘可访问性并避免新组件库。

5. **重构消息流和 Composer 视觉**
   - Assistant Markdown 使用文档流；user 使用轻量右侧气泡；streaming 使用正文尾部 pulse。
   - Composer 自动增长并在最大高度后滚动；圆形 Send/Stop action 保留 aria-label。
   - running + 空草稿显示 Stop，running + 有草稿显示 Follow up；queue 和错误显示不丢失。

6. **完成样式与主题适配**
   - 所有颜色映射到现有 theme token。
   - 为 Markdown code/table、Tool 数据块、Thinking 和 Composer 添加窄窗口样式。
   - 在 `prefers-reduced-motion` 下关闭 pulse/spinner/transition。

7. **自验证并检查边界**
   - 先跑 focused Chat tests，再跑 typecheck、lint/format，最后跑完整 `pnpm check`。
   - 使用 `git diff --name-only` 和 `git diff -- electron` 证明没有后端变化。
   - 检查 dependency diff，只允许 Markdown 所需固定依赖。

## Risks

### Highest risk: 流式 Markdown 的不完整语法

流式内容可能暂时停在未闭合 fenced code、强调或表格中。实现必须始终以当前 canonical `message.content` 整体重渲染，让 `react-markdown` 自己容错；不能另外缓存 AST 或拼接 delta，否则会和现有 authoritative message update 语义冲突。

### Tool 分组破坏原时间线顺序

如果跨 message/thinking/notice 聚合，界面会把工具移到错误位置。分组算法必须只消费严格相邻的 Tool item，遇到任何非 Tool item立即 flush，并用测试固定边界。

### 双层折叠造成可发现性下降

用户要求外层操作组和内层详情都默认折叠。为避免不知道里面是什么，外层展开后必须直接列出所有工具名和状态；只有入参/输出位于第二层，不隐藏工具清单本身。

### Markdown 内容安全和网络行为

为避免 Assistant 文本注入 HTML 或触发远程资源请求，不启用 raw HTML，不渲染图片；链接限制安全协议并使用 `noopener noreferrer`。这是比完整复制 VolcClaw Markdown 能力更窄的选择。

### Composer 视觉重构影响发送行为

最危险的交互改动是 running 状态下 Send/Stop 的切换。实现不改变 `onSend`/`onStop` 条件，先用现有测试锁定 Enter、IME、Follow up、Stop 恢复和 64 KiB，再调整 DOM 和样式。

## Alternatives deliberately rejected

- **直接依赖 VolcClaw ChatKit 或复制其组件树**：会带入私有包、Arco、Tailwind、controller 和大量与现有协议不匹配的依赖。
- **在 reducer/backend 中生成 Tool group**：分组纯属展示语义，写入协议会违反“只改前端”并增加持久化兼容成本。
- **每个 Tool 独立显示，不做外层聚合**：不符合已确认的“已执行 X 项操作”。
- **Thinking streaming 自动展开**：不符合已确认的默认折叠。
- **手写正则 Markdown**：边界不可靠，尤其是嵌套列表、表格和 fenced code；采用成熟的固定版本 Renderer 更可验证。
- **启用 raw HTML / 远程图片 / Shiki**：超出本次正文 Markdown 的必要范围，增加安全、网络和 bundle 成本。

## Proof

### Focused red-green loop

```bash
pnpm test -- src/features/chat/MarkdownContent.test.tsx src/features/chat/ToolGroup.test.tsx src/features/chat/ChatView.test.tsx src/features/chat/ChatComposer.test.tsx
pnpm typecheck
```

### Full quality gate

```bash
pnpm check
```

Healthy result: format、brand、lint、Renderer/Electron typecheck 和全部测试退出 0。

### Frontend-only boundary proof

```bash
git diff --name-only
git diff --exit-code -- electron
git diff --exit-code -- src/features/chat/chatApi.ts src/features/chat/hostChatApi.ts src/features/chat/chatRuntime.ts src/features/chat/sessionReducer.ts
```

预期：除 SDLC 文档、`package.json`/lockfile、Chat React 组件/测试和 Chat CSS 外无其他产品代码变更；backend 与协议文件 diff 为空。
