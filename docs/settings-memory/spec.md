# Spec: Settings Memory 文档查看
Status: accepted。 Implements: `docs/settings-memory/intent.md`。

## 1. 用户体验

Settings 左侧导航在 Agent 后增加 Memory。Memory 页面全局可用，不要求当前存在 project/worktree。

页面包含：

- `memory_summary.md` 与 `MEMORY.md` 两个文档切换按钮；
- 当前文档名称、大小与最后修改时间；
- Markdown 渲染的只读正文；
- Memory Model 与 Phase 1 Reasoning Effort 配置及保存操作；
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

SpireCode 在自身 user data 的设置文件中持久化全局 Memory Model 和 Phase 1 Reasoning Effort。Memory Model 默认值为 `traex/DeepSeek-V4-Flash`，UI 使用完整的 `provider/modelId` 标识输入框。Reasoning Effort 默认值为 `low`，可选值为 `off`、`minimal`、`low`、`medium`、`high`、`xhigh`、`max`。

- model 必须包含一个 `/`，provider 和 modelId 均非空；
- provider 最大 128 UTF-8 bytes，只接受字母、数字、`.`、`_`、`-`；
- modelId 最大 256 UTF-8 bytes，拒绝首尾空白和控制字符；
- 保存使用已有原子持久化能力，不修改 `~/.pi/agent/settings.json` 或 Memory 文档；
- SpireCode 启动且任何 Pi extension 加载前，将配置映射到 `PI_MEMORY_EXTRACT_MODEL` 和 `PI_MEMORY_EXTRACT_THINKING`；
- pi-memory 的 Phase 1 subprocess 从 `PI_MEMORY_EXTRACT_THINKING` 读取 `--thinking`，非法值回退 `low`；
- 已加载 extension 和长生命周期 worker 无法可靠热更新，因此保存后明确提示“Restart SpireCode to apply”。

本次只控制 Phase 1 提取模型和 reasoning effort，不覆盖 `PI_MEMORY_PHASE2_MODEL`，也不改变 Phase 2 固定的 `medium` reasoning。

## 5. IPC

新增 allowlist command：

- `settings_memory_read { document: "summary" | "handbook" }`
- `settings_memory_config_get {}`
- `settings_memory_config_set { provider, modelId, reasoningEffort }`

IPC 拒绝额外字段、非法模型字段和未知 reasoning effort。响应分别为 `MemoryDocument` 和 `MemoryConfig` DTO。文档不存在返回稳定的 `NOT_FOUND` 错误，由 UI 显示尚未生成状态。

## 6. Renderer

- 新增独立 `MemorySettings` 组件，避免继续扩大 `SettingsDialog`。
- 文档正文仅保存在组件局部 state，不写入 Zustand 或 localStorage。
- 使用现有 `MarkdownContent` 渲染 Markdown；Memory 容器提供滚动区域。
- 异步请求使用生命周期保护，防止切换文档或卸载后旧请求覆盖当前结果。
- Memory 页面不接收或依赖 `worktreeId`。

- Memory Model 与 Reasoning Effort 的读取、编辑和保存状态保存在组件局部 state；保存中禁用控件，失败时保留已持久化值并显示错误。
- 移除 Refresh 按钮及相关样式和测试。

## 7. 非目标

- 编辑或删除 Memory 文档；
- 搜索 Memory；
- 查看 raw memories、rollout summaries、skills、日志或数据库；
- worker、Phase 1/Phase 2、job 状态；
- Recall、Automatic Processing、token limit 或其他 pipeline 配置；
- Phase 2 模型或 Reasoning Effort 配置；
- Memory 配置热重载或 worker 重启；
- 文件系统通用浏览能力。

## 8. 验收

- Settings 左侧可以进入 Memory。
- 没有打开项目时仍可查看 Memory。
- 默认展示 `memory_summary.md`，可切换到 `MEMORY.md`。
- 页面不存在 Refresh 按钮；切换文档时读取选中文档。
- 默认显示 `traex/DeepSeek-V4-Flash` 和 `low`，可保存合法的 Memory Model 与 Reasoning Effort，重开应用后仍保留。
- 非法或额外配置参数被拒绝，保存后提示重启 SpireCode 生效。
- 新启动的 Phase 1 subprocess 使用配置的模型和 `--thinking`；Phase 2 仍使用自身模型语义和 `medium` reasoning。
- Markdown 正确渲染，长文档可滚动。
- 文档不存在、超限、非法 UTF-8 和读取失败有明确状态。
- IPC 不接受路径、额外字段或未知文档 ID。
- symlink 无法逃逸 Memory root。
- 相关测试及 `pnpm check` 通过；若仓库存在与本变更无关的基线失败，需单独记录。
