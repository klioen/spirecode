# Plan: Chat 模型、思考级别与 Slash Command（from `docs/chat-model-thinking-selectors/spec.md` 2026-09-16）

## Files that change

### SDLC artifacts

- `docs/chat-model-thinking-selectors/{intent,spec,plan}.md`：记录已确认需求、设计、风险和验证。

### Electron Main and pi adapter

- `electron/contracts.ts`：加入三个 Chat config/mutation command allowlist。
- `electron/ipc.ts`：校验 provider/modelId/thinkingLevel 并路由新增 command。
- `electron/ipc.test.ts`、`electron/contracts.test.ts`：覆盖 allowlist、参数拒绝和路由。
- `electron/domains/chat/types.ts`：定义安全模型、思考级别、Slash Command 和 session config DTO。
- `electron/domains/chat/spireSettings.ts`、`spireSettings.test.ts`：读取 `~/.pi/agent/settings.json` base 与 `~/.spirecode/settings.json` override，深度合并普通设置并保留资源来源。
- `electron/domains/chat/bundledResources.ts`、`bundledResources.test.ts`：合并两层 package/extension 路径，按各自 settings 目录解析相对路径，并让 SpireCode provider 覆盖跨层同名 provider。
- `electron/domains/chat/piAdapter.ts`：暴露 session model/thinking mutation、available model snapshot 与运行时 command discovery，并使用合并后的 settings/resources。
- `electron/domains/chat/piAdapter.test.ts`：固定锁定 SDK seam，覆盖可用模型过滤、能力级别、持久 mutation 和命令投影。
- `electron/domains/chat/chatService.ts`：实现 config、idle mutation、native slash parsing 和 ownership/error handling。
- `electron/domains/chat/chatService.test.ts`：覆盖 config、busy、非法模型/级别、native slash 与普通 command 转发。

### Renderer contract and Chat feature

- `src/bindings/generated.ts`：加入 Chat config DTO。
- `src/bindings/index.ts`：新增 config/get/set command wrappers。
- `src/features/chat/types.ts`：加入 frontend config 类型。
- `src/features/chat/chatApi.ts`、`src/features/chat/hostChatApi.ts`：扩展 API facade。
- `src/features/chat/ChatView.tsx`：加载、刷新和 mutation session config。
- `src/features/chat/ChatComposer.tsx`：底部模型/思考选择器以及 Slash Command menu、过滤与键盘交互。
- `src/features/chat/ChatComposer.test.tsx`：覆盖英文 thinking labels、禁用态、mutation、命令过滤/补全/IME/键盘行为。
- `src/features/chat/ChatView.test.tsx`：覆盖 config API wiring 和 mutation 后同步。
- `src/styles/index.css`：紧凑 selector、autocomplete popover、focus/disabled/responsive 样式。
- `src/features/chat/chatLayout.test.ts`：固定 composer 新布局关键几何和响应式规则。

实现勘察若确认现有集中测试 fixture 或 host 类型也要求同步，将在同一变更中更新，但不扩大产品范围。

## Order of work

1. 以锁定依赖安装结果检查 `AgentSession`、`ModelRuntime`、extension runtime、prompt/skill resource 的实际类型与导出，确定 adapter seam。
2. 增加 settings/resource failing tests：pi base + SpireCode override、资源数组合并、相对路径基准与跨层 provider 覆盖。
3. 先写 backend failing tests：session config、available model filtering、thinking levels、busy mutation、slash command discovery/native dispatch。
4. 扩展 Chat DTO、PiSession adapter 和 ChatService，实现单一权威 config 路径。
5. 扩展 command allowlist、IPC 参数验证、generated bindings 和 host ChatApi，并运行 Electron/contract tests。
6. 先写 Composer 和 ChatView failing tests，覆盖英文 label、动态能力、键盘 autocomplete 和 API 同步。
7. 实现 ChatView config lifecycle、composer selectors 与 Slash menu；补充样式和响应式布局。
8. 运行针对性 tests、format/lint/typecheck；修复后运行完整 `pnpm check`。
9. 审查 diff，确认无凭据/source path 泄漏、无 Renderer Node 权限、无静态目录扫描、无 TUI-only command 误暴露。

## Risks

### Most dangerous: provider override provenance

两层资源最终由 SDK 展开成 extension paths；若只靠加载顺序，重复 provider 可能被现有冲突护栏提前拒绝，或者未来 SDK 顺序变化后反向覆盖。资源必须保留 settings 来源，在 provider registration 冲突检查阶段只允许明确的跨层冲突，并确定性选择 SpireCode 层；无法证明来源时继续 fail-fast。相对路径必须按原 settings 文件目录解析。

### SDK command discovery mismatch

锁定依赖可能没有新版源码中的统一 `session.getCommands()`。最危险的做法是退回 Renderer 或 Main 的静态目录扫描，因为它会遗漏 extension runtime 动态注册和 cwd 信任语义。控制方式是先对锁定包做类型/运行时探针，再把 extension runtime/resource loader 信息保存在 adapter record 中统一投影，并以 contract test 固定。

### Session persistence drift

直接改 agent state 会绕过 JSONL persistence。模型必须调用 `session.setModel()`，思考级别必须调用 `session.setThinkingLevel()`，并测试恢复后的 session context。不得由前端只记住选择值。

### Mid-stream mutation

模型/思考级别在 streaming 中切换可能导致当前请求与 UI 状态不一致。UI 和 ChatService 双层禁止，服务端校验是权威边界。

### Extension commands requiring UI

命令可能等待 `ctx.ui`。本轮不搭建通用 extension UI；测试至少覆盖无 UI command，交互型 command 明确错误。不能通过超时后假装成功。

### Composer keyboard regressions

Slash menu 会竞争 Enter/Tab/Escape 和 IME。事件优先级固定为：IME 不处理；菜单开启时先导航/补全；菜单关闭时沿用 Enter send、Shift+Enter newline。现有 composer tests 全部保留。

## Rejected alternatives

- **前端硬编码模型/命令列表**：会与用户认证、extensions、skills、prompts 和 project cwd 漂移。
- **读取 `~/.pi` 和 `.pi` 目录生成命令**：违反运行时发现原则，也无法反映 extension 动态注册和 trust 结果。
- **把 `/model`、`/thinking` 作为普通 prompt 发给模型**：会污染 transcript，且 pi SDK 的 TUI built-in command 并不由普通 AgentSession prompt 统一实现。
- **运行中允许模型切换**：状态语义不确定且难以保证当前 provider request 一致性。
- **本轮支持全部 pi built-ins**：多数命令依赖 TUI/session replacement/auth UI，超出输入框增强范围。

## Proof

必须通过：

```bash
pnpm exec vitest run electron/domains/chat electron/ipc.test.ts electron/contracts.test.ts
pnpm exec vitest run src/features/chat/ChatComposer.test.tsx src/features/chat/ChatView.test.tsx src/features/chat/chatLayout.test.ts
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm check
```

人工 smoke：

1. 新建 Chat，确认默认模型和 thinking 显示与 pi session 一致。
2. 切换到另一个已认证模型，确认选项与 JSONL `model_change`。
3. 切换每个受支持 thinking level，确认英文显示与 JSONL `thinking_level_change`。
4. 输入 `/`，验证 extension/template/skill 搜索、方向键、Tab、Escape 和 IME。
5. 执行 `/model provider/model`、`/thinking high`，确认选择器同步且 transcript 无控制命令用户消息。
6. streaming 时确认 selectors disabled，普通 follow-up 行为不回归。

## Approval boundary

本计划于 2026-09-16 获批后开始代码修改。锁定 SDK 0.84.4 已确认提供 `extensionsResult.runtime.getCommands()`，实现未使用静态目录扫描。

## Implementation proof

- SDK adapter 红测确认新增 config/mutation 方法缺失，随后转绿：6/6。
- ChatService 红测确认 config/native slash 行为缺失，随后转绿：7/7。
- Composer/ChatView 红测确认 selectors/autocomplete 缺失，随后转绿：12/12。
- `pnpm typecheck` 通过。
- `pnpm check` 通过：42 个测试文件、185 个测试全部通过；format、brand、lint、typecheck 均为退出码 0。
- `git diff --check` 通过。
