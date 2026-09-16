# Spec: Chat Todo 时间线卡片
Status: accepted。 Implements: `docs/chat-todo-timeline/intent.md`。

## 1. Product behavior

- `pi-todo` 每次调用 `pi.appendEntry("pi-todo-state", { todos, explanation })` 后，Chat transcript 在该 entry 的时间位置追加一张 Todo 快照卡片。
- 卡片标题显示 `Updated Todos` 和 `completed/total`。
- 状态展示与 pi TUI 一致：`completed` 为 `✓` 和删除线，`in_progress` 为 `●` 和 accent，`blocked` 为 `!` 和 warning，`pending` 为 `○` 和弱化文字。
- explanation 存在时展示在标题与列表之间。
- 卡片作为独立 timeline item；它会终止相邻 Tool 的 process 分组，不进入 Thinking/Tool 折叠区。
- 第一版不增加常驻 Composer widget、侧栏、编辑或交互式勾选。

## 2. Trusted Main projection

新增显式 Chat Todo DTO：

```ts
type ChatTodoStatus = "pending" | "in_progress" | "completed" | "blocked";
interface ChatTodoItem { id: string; step: string; status: ChatTodoStatus }
interface ChatTodoModel {
  id: string;
  todos: ChatTodoItem[];
  explanation?: string;
  createdAt?: number;
}
```

Main 的 wire normalization：

- 只接受 `entry.type === "custom"` 且 `entry.customType === "pi-todo-state"`。
- `entry.data` 必须是 object；`todos` 必须是数组。
- 每项只投影非空 `id`、非空 `step` 和四个 allowlisted status。
- 最多投影 20 项；非法项被过滤；过滤后为空则整条 entry 被丢弃。
- explanation 只接受 string，并裁剪首尾空白；空字符串省略。
- 不把原始 entry、其他 data 字段、任意 custom type 或扩展私有内容发送到 Renderer。
- 实时事件转换为 `{ type: "todo_update", todo }`。

## 3. Snapshot and ordering

- `PiSession` 增加读取当前 active branch entries 的只读方法，由 Main 内部的 `SessionManager.getBranch()` 提供。
- attach snapshot 保留 `session.messages` 作为经过 pi compaction/custom-message 处理的权威消息源，同时读取 active branch 中的 custom entries。
- 既有 message normalization 不变；allowlisted Todo custom entry 按时间戳插入消息 timeline；其他 session entry 忽略。
- snapshot fence 在读取 branch 前捕获，读取期间产生的 `entry_appended` 继续进入现有有界缓冲，快照返回后只 flush 更新序列大于 fence 的事件。
- 新建或测试 adapter 若只能提供 message 列表，接口仍返回明确的 entry 列表，不在 Renderer 推断原始 pi 状态。

## 4. Renderer state and rendering

- `ChatTimelineItem` 增加 `{ type: "todo" } & ChatTodoModel`。
- `ChatSessionEvent` 增加 `todo_update`。
- reducer 使用 Todo entry ID 幂等 upsert；不同 entry ID 保留为不同历史快照。
- 新增 `TodoListCard.tsx`，只消费安全 DTO。
- `ChatView` 为 Todo timeline item 渲染卡片。
- `projectChatTimeline()` 遇到 Todo 时 flush 当前 Tool segment，维持真实时间顺序。
- 样式复用项目现有 CSS token，不增加依赖，不引入 pi-tui 或 ANSI 转换。

## 5. Security and limits

- Main 是 raw pi entry 到 Renderer DTO 的唯一信任边界。
- entry ID、Todo ID、step、explanation 均按 wire 文本字段处理，不作为 HTML 注入。
- React 使用普通文本节点渲染，不使用 `dangerouslySetInnerHTML`。
- 未知 custom entry 保持静默丢弃，避免扩展状态或 secret 意外穿透 IPC。

## 6. Proof

- wire tests：合法 Todo 实时转换；未知 custom entry 丢弃；非法 data/status/空 Todo 过滤；最多 20 项；私有字段不泄漏。
- snapshot tests：active branch 中消息与 Todo 保持顺序；历史 Todo 可恢复；attach 期间更新不丢失、不重复。
- reducer tests：`todo_update` 插入、同 ID 幂等、sequence fence 生效。
- component/view tests：计数、四种 marker、删除线/状态 class、explanation、ARIA、与 process 分组边界。
- 全量运行 `pnpm check`。

## 7. Concerns

- 最大风险是快照从 `session.messages` 切换到 branch entry 投影后改变既有消息/Thinking/Tool 顺序；必须用兼容性测试固定现有输出。
- 不能用 raw branch message 直接替换 `session.messages`，否则可能绕过 pi 的 compaction/custom-message 恢复语义；branch 只用于提取 allowlisted Todo entry。
- attach fence 必须覆盖 branch 读取，否则读取期间追加的 Todo 可能重复或丢失。
