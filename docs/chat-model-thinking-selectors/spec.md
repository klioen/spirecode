# Spec: Chat 模型、思考级别与 Slash Command
Status: accepted。 Implements: `docs/chat-model-thinking-selectors/intent.md`。

## 1. User experience

### 1.1 Composer controls

Chat composer 底部左侧增加两个紧凑选择器，右侧继续保留字节计数、Stop/Send：

1. 模型选择器显示当前模型的 `provider/model`。
2. 思考级别选择器显示英文标签：`Off`、`Minimal`、`Low`、`Medium`、`High`、`XHigh`、`Max`。
3. 模型选择器只列出 `ModelRuntime.getAvailable()` 返回的已认证可用模型。
4. Chat 以 `~/.pi/agent/settings.json` 为基础配置，并叠加 `~/.spirecode/settings.json`；普通字段由 SpireCode 层深度覆盖，`packages` / `extensions` 资源合并加载。两层扩展注册同名 provider 时以 SpireCode 层为准；同层冲突仍 fail-fast。
5. 思考级别选项来自当前 session 的 `getAvailableThinkingLevels()`，不能假定每个推理模型都支持完整七档。
6. 非推理模型只提供有效的 `Off`；切换模型后立即以 pi clamp 后的实际级别刷新 UI。
7. session 为 streaming、loading、reconnecting、failed 或 auth-required 时禁用选择器。模型或思考级别 mutation 在途时两个选择器也禁用。
8. mutation 失败时恢复服务端权威 config，并在 composer 内显示错误。

### 1.2 Slash Command autocomplete

1. 当输入以 `/` 开头且光标位于首行 command token 内时显示命令菜单。
2. 输入内容对命令名称执行大小写不敏感的前缀优先过滤，并允许子串匹配。
3. 菜单项显示 `/name`、可选 argument hint、description 和 source。
4. 键盘行为：上下箭头移动选中项，`Enter` 或 `Tab` 补全，`Escape` 关闭；IME composing 期间不拦截提交键。
5. 选中不需要参数的命令时仍只完成命令文本，不自动执行，避免误触有副作用的 extension command。
6. command token 后已有参数时菜单关闭，用户按 Enter 按现有发送流程提交完整文本。
7. 命令列表按当前 session 动态查询，不扫描 Renderer 文件系统，不在前端写死 extension/template/skill 目录。

## 2. Command scope

### 2.1 Runtime commands

后端从当前 session runtime 获取并规范化：

- extension commands；
- prompt templates；
- skill commands。

每项仅返回：

```ts
interface ChatSlashCommand {
  name: string;
  description?: string;
  argumentHint?: string;
  source: "extension" | "prompt" | "skill" | "builtin";
}
```

禁止返回 source path、extension instance、prompt 内容、skill 正文或其他敏感 metadata。

### 2.2 Native built-ins

SpireCode 原生支持：

- `/model [provider/model]`
- `/thinking [off|minimal|low|medium|high|xhigh|max]`

无参数时 autocomplete 提供 argument hint；提交无参数命令时不打开 pi TUI，而是在 composer 中保持可编辑状态并提示用户选择或补充参数。带参数时由 ChatService 解析并调用与底部选择器相同的 mutation。

不暴露尚无 GUI 对应能力的 pi TUI built-ins，例如 `/settings`、`/tree`、`/hotkeys`、`/quit`、`/login`、`/resume`。后续支持这些命令必须独立定义 GUI 语义。

### 2.3 Execution

- extension/template/skill command 保持通过 `session.prompt(text, { expandPromptTemplates: true })` 执行，复用 pi 的 command dispatch 与 expansion。
- streaming 时现有 follow-up 语义保留；pi SDK 可立即处理的 extension command 仍可被接受。
- native `/model` 和 `/thinking` 不进入 LLM transcript，由 ChatService 在发送边界拦截。
- 未知 `/command` 按普通 prompt 交给 pi，避免 SpireCode 与扩展动态状态产生竞态。

## 3. Session configuration contract

新增 DTO：

```ts
interface ChatModelOption {
  provider: string;
  id: string;
  label: string;
  reasoning: boolean;
}

type ChatThinkingLevel =
  | "off"
  | "minimal"
  | "low"
  | "medium"
  | "high"
  | "xhigh"
  | "max";

interface ChatSessionConfig {
  model: { provider: string; id: string } | null;
  models: ChatModelOption[];
  thinkingLevel: ChatThinkingLevel;
  availableThinkingLevels: ChatThinkingLevel[];
  commands: ChatSlashCommand[];
}
```

新增 IPC commands：

```text
chat_session_config(worktreeId, sessionId) -> ChatSessionConfig
chat_session_set_model(worktreeId, sessionId, provider, modelId) -> ChatSessionConfig
chat_session_set_thinking_level(worktreeId, sessionId, thinkingLevel) -> ChatSessionConfig
```

所有操作先复用 ChatService 的 worktree/session ownership 校验。provider、modelId、thinkingLevel 使用长度和枚举校验，不接受 Renderer 提供的模型对象。

## 4. Backend design

### 4.1 Pi adapter

`PiSession` 增加窄化能力：

- 读取当前 `model` 和 `thinkingLevel`；
- `getAvailableThinkingLevels()`；
- `setModel(model)`；
- `setThinkingLevel(level)`；
- 获取当前 session 的 runtime slash commands。

共享 `ModelRuntime` 提供异步 available model snapshot 和按 provider/id 精确解析。模型 DTO 只投影安全展示字段。

命令发现优先使用 session/extension runtime 的 `getCommands()`，并合并 prompt templates 与 skills 的运行时命令信息；不得以静态目录扫描替代。若当前 SDK seam 未直接公开统一 session method，则 adapter 在创建 session 时保留 `createAgentSessionFromServices()` 返回的 extension/runtime/resource 信息，仍由 adapter 统一规范化。

### 4.2 ChatService

- `config()` 返回当前权威配置。
- `setModel()` 仅在 session idle 时允许，校验目标存在于 available snapshot，再调用 pi `setModel()`；返回切换后实际 config。
- `setThinkingLevel()` 仅在 idle 时允许，校验枚举且属于 session 当前 available levels，再调用 pi API；返回实际 config。
- native slash command 在 `send()` 内、文本验证和 ownership 校验后解析，复用 mutation 方法并返回 accepted；避免把控制命令写成用户 prompt。
- 运行中 mutation 返回 `CHAT_SESSION_BUSY`。

## 5. Frontend state

配置是 Chat session 领域状态，但体积小且需要 UI 响应；由 `ChatView` 按 session 加载并持有，不把模型目录写入全局 Zustand。attach 成功后并行/随后读取 config；模型或思考级别 mutation 成功后使用返回值替换本地权威 config。

Slash menu 的 query、highlight index 和 open 状态属于 `ChatComposer` 局部视图状态。组件通过 props 接收 config 和 mutation callbacks，保持可独立测试。

## 6. Security and errors

- Renderer 只传 ID 和枚举，不传模型 endpoint、headers、API key 或 source paths。
- Electron Main 从共享 ModelRuntime 解析模型，拒绝不可用或未认证模型。
- GUI 启动未继承 shell 环境且缺少 `ARK_API_KEY` 时，Main 通过固定的 `/bin/zsh -ilc` 命令读取登录交互式 shell 中的 `ARK_API_KEY`；不从 `ARK_API_KEYS` 推导、不覆盖已有值、不记录凭据。
- `~/.pi/agent/settings.json` 与 `~/.spirecode/settings.json` 均只在 Main 读取。相对资源路径分别以其所属 settings 文件目录解析，不能因合并而改变路径基准。
- SpireCode provider 覆盖只作用于跨层同名 provider；SpireCode 层内部、pi 层内部以及非 provider 的 tool/command 冲突继续拒绝，避免不确定加载顺序。
- 错误继续映射到既有稳定 Chat error code；不把认证值、环境变量或扩展内部异常堆栈发送给 Renderer。
- Slash menu 描述按纯文本渲染，不使用 HTML。

## 7. Acceptance criteria

1. 新建和恢复的 Chat 都显示真实当前模型与思考级别。
2. 模型菜单只显示当前已认证可用模型；选择后 session 使用并持久化该模型。
3. pi settings 中的 provider 默认可见；SpireCode settings 可追加 provider，并确定性覆盖跨层同名 provider。
4. 思考选项严格匹配当前模型能力并使用英文标签。
5. streaming 时两个选择器不可操作，idle 后恢复。
6. 输入 `/` 可发现当前 session 的 extension/template/skill commands，支持键盘过滤与补全。
7. `/model provider/model` 与 `/thinking high` 和底部选择器结果一致，不产生用户消息。
8. 普通 slash command 由 pi SDK 正确 dispatch/expand。
9. Renderer 无 Node/pi SDK 权限，IPC allowlist 和参数校验覆盖所有新增命令。

## 8. Concerns

### Concern A: extension command UI

部分 extension command 会调用 `ctx.ui.select/confirm/input/custom`。当前 SpireCode SDK 嵌入没有实现通用 extension UI transport。本轮只保证无需交互 UI 的 extension command 可执行；需要交互的命令必须收到明确失败，不能静默挂起。通用 extension UI 是独立变更。

### Concern B: command discovery API version

仓库固定 pi SDK `0.84.4`，而本机源码可能更新。实现必须以已安装锁定版本的实际导出和类型为准，并用 adapter contract test 固定；不得依赖仅存在于更新源码的 API。

### Concern C: model catalogue latency

`ModelRuntime.getAvailable()` 可能涉及认证状态读取。配置加载应有 pending/error UI，并复用 runtime cache；不能在每次键盘输入时刷新模型目录。
