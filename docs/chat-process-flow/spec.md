# Spec: Chat 统一过程流与智能滚动
Status: accepted。 Implements: `docs/chat-process-flow/intent.md`。

## 1. Timeline projection

Renderer 将现有 timeline 投影为 display items，不改变 runtime state：

- `thinking` 与 `tool` 都属于 process step。
- 严格相邻的 process step 组成一个 process segment。
- `message` 或 `notice` 会终止 segment。
- segment 只有一个步骤时直接显示该步骤。
- segment 有两个及以上步骤时显示一个默认折叠的过程摘要，展开后按原顺序显示所有步骤。

## 2. Process presentation

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
- 多步骤完成：`已执行 X 项操作`。
- 多步骤存在失败：`已执行 X 项操作，Y 项失败`。
- 多步骤运行中：优先展示当前工具的语义动作与摘要，而不是笼统计数。
- 工具步骤标题始终显示原始 `tool.name`，不映射成中文语义动作；运行中的多步骤摘要仍可使用当前工具的语义动作。
- 工具类型 icon 仍按 bash/read/write/edit/web_search/web_fetch/unknown 映射。
- 参数摘要优先取 `path/file_path/command/query/url`，并截断过长文本。

### Interaction

- Thinking 默认折叠。
- 多步骤 process group 默认折叠。
- group 展开后，单个 Tool 的详情仍默认折叠。
- disclosure icon 在折叠态默认隐藏；hover、focus-visible、展开时显示。
- Thinking 展开内容左侧显示 2px 浅灰引用线，最大高度 160px，超出内部滚动。
- Tool 展开后只显示一张轻量详情卡；卡片顶部为 `input` / `output` 两个 Tab，同一时刻只展示当前 Tab 内容。
- 默认选择 `input`；没有 input 且存在 output 时默认选择 `output`。
- 详情卡使用浅色表面、细边框、12px 圆角；内容区最大高度 240px并内部滚动，保留 16,000 字符截断。
- 当前运行步骤标题使用灰色 shimmer；`prefers-reduced-motion` 下关闭。

## 3. Message and Composer layout

- Thread 与 Composer 最大宽度调整为 960px。
- Assistant 保持无气泡 Markdown 文档流，不显示头像、名称或装饰 icon。
- User 气泡移除边框，改为统一 8px 圆角，最大宽度不超过 720px。
- 普通 Composer 使用 24px 圆角、约 126px 最小高度、低对比边框，无常驻大阴影。
- Agent running 且草稿为空时只显示 Stop；存在 follow-up 草稿时显示发送按钮，并保留可中止能力但不制造两个同等视觉权重的主按钮。

## 4. Scroll behavior

使用原生 transcript，不引入虚拟列表：

- 距底部不超过 48px 时处于 follow 模式。
- 用户主动向上滚动后暂停自动跟随。
- 回到底部后恢复 follow。
- 距底部超过 250px 显示 32px 圆形“回到底部”按钮。
- 新 streaming assistant 出现时，只有处于 follow/近底部时才置底。
- timeline 高度变化通过 `ResizeObserver` 处理；处于 follow 时滚到底部。
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
