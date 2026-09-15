# Spec: Chat 统一过程流与智能滚动
Status: accepted。 Implements: `docs/chat-process-flow/intent.md`。

## 1. Timeline projection

Renderer 将现有 timeline 投影为 display items，不改变 runtime state：

- `thinking` 始终投影为独立的 process item，不参与工具操作聚合或计数。
- 只有严格相邻的 `tool` item 组成一个 process segment。
- `thinking`、`message` 或 `notice` 都会终止当前 Tool segment。
- Tool segment 只有一个步骤时直接显示该 Tool。
- Tool segment 有两个及以上步骤时显示一个默认折叠的过程摘要，展开后按原顺序显示所有 Tool。

## 2. Process presentation

视觉基线对齐 VolcClaw 产品层 TransformPart：过程区应像连续的低噪声文字步骤，而不是一组按钮或卡片。

### Icons

每行前置 16×16px icon：

- Thinking：Brain/Reasoning icon。
- Process group：Tools/Process icon。
- `bash`：Terminal icon。
- `read`：File/Search file icon。
- `write`：File add icon。
- `edit`：Edit icon。
- `web_search`：Search icon。
- `web_fetch`：Global/Link icon。
- unknown：Tools icon。

图标和标题默认使用 `--text-subtle` 或 `--text-muted`；error 使用 `--danger`。

### Labels and summaries

- Thinking：`深度思考`。
- 多步骤完成：聚合最多三个去重后的语义动作，例如 `读取文件、搜索网页、执行命令等多项操作`；全部失败时回退为 `分析任务`。
- 多步骤运行中：展示当前工具的具体动作与对象，例如 `执行 pnpm test`，并使用当前工具 icon。
- 文件对象摘要只显示 basename；完整路径保留在 Input 详情。
- 工具步骤标题始终显示原始 `tool.name`，不映射成中文语义动作；运行中的多步骤摘要仍可使用当前工具的语义动作。
- 工具类型 icon 仍按 bash/read/write/edit/web_search/web_fetch/unknown 映射。
- 参数摘要优先取 `path/file_path/command/query/url`，并截断过长文本。

### Interaction

- Thinking 默认折叠。
- 多步骤 process group 默认折叠。
- group 展开后，单个 Tool 的详情仍默认折叠。
- 过程行统一为 14px/22px，行本身无水平 padding、无 hover 背景。
- disclosure icon 紧跟内容，在折叠态默认隐藏；hover、focus-visible、展开时显示。
- Thinking 展开内容左侧显示 2px 浅灰引用线，最大高度 160px，超出内部滚动。
- Tool 展开后只显示一张轻量详情卡；卡片顶部为 `input` / `output` 两个 Tab，同一时刻只展示当前 Tab 内容。
- 默认选择 `input`；没有 input 且存在 output 时默认选择 `output`。
- 通用详情卡最大高度 320px，Tab header 40px、13px 字号、18px 横向 padding，内容区最大高度 240px并内部滚动，保留 16,000 字符截断。
- 通用详情卡 hover/focus-within 时显示复制当前 Tab 内容按钮。
- `bash` 使用 Shell 风格预览；`write/edit` 使用 Diff 风格预览；`web_search` 在可解析结构化结果时使用搜索结果列表，否则回退通用 Input/Output 卡。
- 当前运行步骤标题使用灰色 shimmer；`prefers-reduced-motion` 下关闭。

## 3. Message and Composer layout

- Thread 与 Composer 最大宽度调整为 960px。
- Assistant 保持无气泡 Markdown 文档流，不显示头像、名称或装饰 icon；正文基础排版为 16px/24px。
- User 气泡移除边框，改为统一 8px 圆角，最大宽度不超过 720px，文字为 16px/24px，并使用更明确的轮次上下间距。
- Markdown 标题保持紧凑的 16px 基础字号，通过字重与间距分层；列表项间距 8px。
- fenced code block 显示低对比语言 header 和 hover/focus Copy；保持 raw HTML 禁用。
- streaming cursor 由 Markdown AST 插入最后一个可展示内容附近，而不是放在整个 Markdown 容器之后。
- 普通 Composer 使用 24px 圆角、约 126px 最小高度、低对比边框，无常驻大阴影。
- Agent running 且草稿为空时只显示 Stop；存在 follow-up 草稿时显示发送按钮，并保留可中止能力但不制造两个同等视觉权重的主按钮。

## 4. Scroll behavior

使用原生 transcript，不引入虚拟列表：

- 距底部不超过 48px 时处于 follow 模式。
- 用户主动向上滚动后暂停自动跟随。
- 回到底部后恢复 follow。
- 距底部超过 250px 显示 32px 圆形“回到底部”按钮。
- 区分程序滚动与用户向上滚动；内部可滚动 Tool/Thinking 区域的滚动不改变外层 follow 意图。
- 新 streaming assistant 出现时，只有处于 follow/近底部时才置底，并在 50/180ms 做首轮校正。
- timeline 高度变化通过 `ResizeObserver` 处理；处于 follow 时滚到底部。
- 流式完成后在 16/80/180/360ms 做高度校正；手动回到底部最多校正到 720ms。
- session 切换重置滚动状态。
- 所有 timer、observer 和 listener 在卸载时清理。

## 5. Frontend-only boundary

不得修改：

- `electron/**`
- preload、IPC contracts
- `chatApi.ts`、`hostChatApi.ts`
- `chatRuntime.ts`、`sessionReducer.ts`
- `types.ts` wire shape

## 6. Proof

- process projection：单 Thinking、单 Tool 直出；Thinking+Tool、多 Tool 聚合；message/notice 切断。
- semantic icon 与 summary：每类工具、unknown、running、done、error。
- disclosure 和默认折叠。
- scroll controller：近底跟随、向上滚动暂停、回到底部恢复、阈值按钮、ResizeObserver。
- Composer 与消息样式护栏。
- `pnpm check`、`pnpm build`。

## 7. Concerns

- 流式事件可能在同一 assistant turn 中产生多个 message item；只能按 timeline 邻接关系分段，不能跨正文合并。
- jsdom 不提供真实布局，滚动控制器测试需要显式 mock `scrollHeight/clientHeight/scrollTop/ResizeObserver`。
- running shimmer 必须保持文字可读，并尊重 reduced motion。
