# Spec: Settings Memory 文档查看
Status: accepted。 Implements: `docs/settings-memory/intent.md`。

## 1. 用户体验

Settings 左侧导航在 Agent 后增加 Memory。Memory 页面全局可用，不要求当前存在 project/worktree。

页面包含：

- `memory_summary.md` 与 `MEMORY.md` 两个文档切换按钮；
- 当前文档名称、大小与最后修改时间；
- Markdown 渲染的只读正文；
- Phase 1 Model、Phase 2 Model 与 Phase 1 Reasoning Effort 配置及保存操作；
- loading、文档未生成、读取失败和空文档状态。

页面不提供 Refresh 按钮。首次进入默认展示 `memory_summary.md`，切换文档时按需重新读取。关闭 Settings 后不在全局 store 中保留文档正文。

## 2. Memory 数据服务

Electron Main 新增独立的只读 `MemoryService`，不复用 worktree `FilesystemService`，因为 Memory 根目录不属于 project。

Memory 根目录解析规则：

1. `PI_MEMORY_DIR` 存在且非空时使用该目录；
2. 否则使用 `~/.pi/agent/memories`；
3. 服务只读，不因目录或文档不存在而创建任何文件或目录。

服务只接受两个枚举文档 ID：

- `summary` → `memory_summary.md`
- `handbook` → `MEMORY.md`

返回字段白名单：`id`、`name`、`content`、`size`、`updatedAt`。不返回绝对路径、目录配置或其他文件内容。

## 3. 文件安全

- Renderer 不能传文件名、相对路径、绝对路径或 Memory root。
- Main 从文档 ID 映射固定文件名。
- 对 root 和目标文件执行 canonical path 校验，拒绝逃逸 root 的 symlink。
- 目标必须是普通文件。
- 单文档上限为 2 MiB；拒绝包含 NUL 或无效 UTF-8 的内容。
- 不允许读取 `.git`、`raw_memories.md`、`worker.log`、rollout summaries、skills 或 SQLite。
- `PI_MEMORY_DIR` 仅由 Main 进程环境读取，不通过 IPC 暴露。

## 4. Memory 配置

SpireCode 在自身 user data 的设置文件中持久化 Phase 1 Model、Phase 2 Model 和 Phase 1 Reasoning Effort。两个模型默认值均为 `traex/DeepSeek-V4-Flash`，UI 使用模型下拉框，不允许手动输入。Reasoning Effort 默认值为 `low`，可选值为 `off`、`minimal`、`low`、`medium`、`high`、`xhigh`、`max`。旧版单模型配置迁移时同时作为 Phase 1 和 Phase 2 Model，避免升级改变既有行为。

- 模型选项来自 Pi `ModelRuntime.getAvailable()`，只返回当前运行环境可用且认证条件满足的模型；
- 新增全局模型目录，不依赖 worktree 或 Chat session，也不创建隐藏 session；
- 下拉按 provider 分组，显示模型 label，提交稳定的 provider/id；
- 已持久化但当前不可用的模型仍作为 `Unavailable` 选项显示，不能静默改为其他模型；
- Main 保存前验证 Phase 1/Phase 2 Model 均存在于最新可用目录；不可用模型不能作为新值保存；
- 保存使用已有原子持久化能力，不修改 `~/.pi/agent/settings.json` 或 Memory 文档；
- SpireCode 启动且任何 Pi extension 加载前，将配置映射到 `PI_MEMORY_EXTRACT_MODEL`、`PI_MEMORY_PHASE2_MODEL` 和 `PI_MEMORY_EXTRACT_THINKING`；
- pi-memory 的 Phase 1 subprocess 从 `PI_MEMORY_EXTRACT_THINKING` 读取 `--thinking`，非法值回退 `low`；
- 已加载 extension 和长生命周期 worker 无法可靠热更新，因此保存后明确提示“Restart SpireCode to apply”。

本次分别控制 Phase 1 和 Phase 2 模型，但不改变 Phase 2 固定的 `medium` reasoning。

## 5. IPC

新增 allowlist command：

- `settings_memory_read { document: "summary" | "handbook" }`
- `settings_memory_models_list {}`
- `settings_memory_config_get {}`
- `settings_memory_config_set { phase1Provider, phase1ModelId, phase2Provider, phase2ModelId, reasoningEffort }`

模型目录响应复用字段白名单 DTO：`provider`、`id`、`label`、`reasoning`，不返回认证信息、配置路径或 SDK 对象。IPC 拒绝额外字段、目录外模型和未知 reasoning effort。响应分别为 `MemoryDocument`、`ChatModelOption[]` 和 `MemoryConfig` DTO。文档不存在返回稳定的 `NOT_FOUND` 错误，由 UI 显示尚未生成状态。

## 6. Renderer

- 新增独立 `MemorySettings` 组件，避免继续扩大 `SettingsDialog`。
- 文档正文仅保存在组件局部 state，不写入 Zustand 或 localStorage。
- 使用现有 `MarkdownContent` 渲染 Markdown；Memory 容器提供滚动区域。
- 异步请求使用生命周期保护，防止切换文档或卸载后旧请求覆盖当前结果。
- Memory 页面不接收或依赖 `worktreeId`。

- Phase 1/Phase 2 Model 使用下拉框，按 provider 分组展示 Pi 当前可用模型；不提供自由文本输入。
- 模型目录加载、Phase 1/Phase 2 Model 与 Reasoning Effort 的编辑和保存状态保存在组件局部 state；保存中禁用控件，失败时保留已持久化值并显示错误。
- 模型目录为空或加载失败时显示明确状态，但不影响下方 Memory 文档阅读。
- Save 位于配置区右下角，使用低强调的紧凑次级按钮，不使用 accent 填充。
- 移除 Refresh 按钮及相关样式和测试。

## 7. 非目标

- 编辑或删除 Memory 文档；
- 搜索 Memory；
- 查看 raw memories、rollout summaries、skills、日志或数据库；
- worker、Phase 1/Phase 2、job 状态；
- Recall、Automatic Processing、token limit 或其他 pipeline 配置；
- Phase 2 Reasoning Effort 配置；
- Memory 配置热重载或 worker 重启；
- 文件系统通用浏览能力。

## 8. 验收

- Settings 左侧可以进入 Memory。
- 没有打开项目时仍可查看 Memory。
- 默认展示 `memory_summary.md`，可切换到 `MEMORY.md`。
- 页面不存在 Refresh 按钮；切换文档时读取选中文档。
- Phase 1/Phase 2 使用模型下拉，按 provider 展示当前可用模型，不存在自由文本输入。
- Phase 1/Phase 2 默认均选择 `traex/DeepSeek-V4-Flash`，Reasoning Effort 默认显示 `low`；可分别保存两个可用模型，重开应用后仍保留。
- 已保存模型暂时不可用时仍显示原值并标记 `Unavailable`；模型目录为空或加载失败时不能提交新配置。
- 非法或额外配置参数被拒绝，保存后提示重启 SpireCode 生效。
- 新启动的 Phase 1 subprocess 使用配置的 Phase 1 Model 和 `--thinking`；Phase 2 使用配置的 Phase 2 Model，并保持 `medium` reasoning。
- Markdown 正确渲染，长文档可滚动。
- 文档不存在、超限、非法 UTF-8 和读取失败有明确状态。
- IPC 不接受路径、额外字段或未知文档 ID。
- symlink 无法逃逸 Memory root。
- 相关测试及 `pnpm check` 通过；若仓库存在与本变更无关的基线失败，需单独记录。
