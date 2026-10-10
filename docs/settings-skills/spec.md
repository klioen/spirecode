# Spec: Settings Skills 管理
Status: accepted。 Implements: `docs/settings-skills/intent.md`。

## 1. 用户体验

Settings 左侧在 Agent 与 Memory 附近增加独立的 **Skills** 导航项。Skills 页面基于当前 `worktreeId` 展示新 Agent Session 将使用的 Skill catalog；未打开项目时显示需要打开项目的 empty state，不扫描任意 Renderer 提供的路径。

页面顶部说明：Skills 会向 Agent 提供专门工作流与指令；开关变更仅对新建 Agent Session 生效。列表分为三个区块：

1. **系统内置**：保留产品分组；当前主线不再随应用携带 Skills，因此通常为空。
2. **用户 Skills**：Pi 用户级配置和默认用户目录中发现的 Skills。
3. **项目 Skills**：当前工作区项目级配置和默认项目目录中发现的 Skills。

每项显示：

- Skill 名称。
- `SKILL.md` frontmatter 的 description。
- 来源标签；用户和项目 Skill 可显示经过 home/worktree 缩写的安全展示路径。
- 启用开关。

空分组显示独立 empty state。加载失败显示错误，不把失败误报为空列表。

## 2. Catalog 与“当前加载”定义

“当前加载”定义为：以当前工作区为上下文，按 SpireCode 新 Agent Session 的资源装配规则，Pi SDK 能够解析且通过校验的最终 Skill 集合。Catalog 覆盖：

- 当前主线不再 bundle `pi-sdlc`；若未来重新引入 App-owned Skills，可归入系统内置分组。
- Pi 用户默认目录：`~/.pi/agent/skills`、`~/.agents/skills`。
- `~/.pi/agent/settings.json` 中 `skills` 和 `packages` 提供的 Skills。
- 当前工作区的 `.pi/skills`、`.agents/skills`。
- 当前工作区 `.pi/settings.json` 中 `skills` 和 `packages` 提供的 Skills，前提是项目资源已获信任。

Main 必须复用 Pi SDK 的 `DefaultPackageManager` / Resource Loader 解析结果和 Skill parser 行为，不在 Renderer 中扫描目录，也不自行复制一套不一致的 Skill frontmatter 解析器。名称冲突遵循 Pi 的实际解析优先级，只展示最终获胜、会提供给 Session 的条目；Pi 报告的无效 Skill 和冲突诊断作为 catalog 加载错误或诊断处理，不伪装成可切换条目。

`SkillSetting` DTO 至少包含：

- `id`: 基于规范化来源身份生成的稳定 opaque ID。
- `name`、`description`。
- `kind: "builtin" | "user" | "project"`。
- `displayPath`: 仅用于展示的缩写路径或内置 package 名，不提供文件操作能力。
- `enabled`、`status`。
- `disableModelInvocation`: 标识该 Skill 是否只允许显式命令调用。

列表按系统内置、用户、项目排序，各组内按稳定名称排序。

## 3. 单 Skill 开关语义

SpireCode 在自有 user data 的 `extension-settings.json` 中持久化 Skill ID 到 boolean 的覆盖，不改写 Pi settings 或 Skill 文件。现有 state schema 从 v7 升级到 v8，并兼容保留语言和 provider-neutral Memory 配置；Extensions catalog 在当前主线中只读且没有本地 override。

默认状态取 Pi SDK 解析结果中的资源 enabled 状态；SpireCode override 优先。单 Skill 开关只影响该 Skill，即使多个 Skills 来自同一个 package，也不联动其他 Skills 或该 package 的 Extensions、Prompts、Themes。

创建新 Agent Session 时，Main 在 Pi SDK 完成 Skill 加载后通过 `skillsOverride` 过滤禁用条目。过滤发生在系统提示词和 Skill command 注册建立之前，因此禁用 Skill：

- 不出现在 Agent 可自动选择的 `<available_skills>` 列表中。
- 不注册 `/skill:<name>` 命令。
- 不影响同 package 的其他资源。

已存在 Session 不热加载或热卸载。若 Skill 文件变化导致稳定身份消失，旧 override 保留为无害历史数据；未知 ID 不能通过 IPC 写入。

## 4. 资源装配一致性

目前 SpireCode 的 Chat 资源装配通过 Pi SDK 0.87.1 解析 Pi 与 SpireCode 两层 settings 资源，但没有单独暴露 Skills 开关。本变更应建立同一套 Main-owned Skill 选择边界：

1. 解析当前工作区及全局 Pi Skill 来源。
2. 保留系统内置 Skills 的扩展位，但不合成已经从主线移除的 bundled `pi-sdlc`。
3. 对用户显式打开且由 ProjectService 解析的 worktree 使用现有项目 trust 边界，并保留 Pi 的校验和冲突优先级。
4. 应用 SpireCode 单 Skill overrides。
5. 将同一选择结果用于 Settings catalog 与新 Session 的 `skillsOverride`。

不得仅在 UI 隐藏 Skill 而仍将其加载到 Session，也不得仅过滤系统提示词却保留显式 Skill command。

## 5. IPC 与类型

新增 allowlist commands：

- `settings_skills_list { worktreeId } -> SkillSetting[]`
- `settings_skill_set_enabled { worktreeId, skillId, enabled } -> SkillSetting[]`

要求：

- `worktreeId` 必须由 `ProjectService` 解析为 canonical root。
- `skillId` 只允许操作当前 catalog 中存在的 opaque ID。
- 拒绝额外字段、任意路径和未知 ID。
- Main、Preload、Renderer 使用显式 typed DTO；不向 Renderer 返回 Pi SDK 对象、Skill 正文、配置内容、凭据或环境变量。

## 6. 安全与兼容性

- 所有文件读取、package 解析、symlink 检查和 trust 判断位于 Electron Main；只有 ProjectService 已登记的显式打开 worktree 才能触发项目 Skill 解析。
- Renderer 只使用 `window.spire.invoke` allowlist bridge。
- 项目 Skill 是可引导 Agent 执行脚本或修改文件的指令，页面保留来源信息和安全提示。
- 用户级绝对路径缩写为 `~`；项目级路径显示为 worktree-relative；内置路径不暴露 App bundle 绝对位置。
- 只读 Extensions catalog、Memory 对用户安装 `pi-memory` 的依赖判断、Agent readiness 和 model catalog 行为不得回归。
- `enableSkillCommands` 仍控制全局 Skill commands 能力；单 Skill disabled 状态是更窄的过滤条件。

## 7. 验收标准

- Settings 出现独立 Skills 导航和页面，中英文文案完整。
- 打开项目后能看到实际存在的用户级和项目级 Skills；当前没有 bundled Skills 时系统内置分组显示空态。
- 每项展示名称、description、来源和开关；三类来源分组正确，路径展示不泄露 App bundle 或无关绝对路径。
- 关闭单个 Skill 后重新打开 Settings 状态保持；同 package 的其他 Skills 不受影响。
- 关闭的 Skill 不进入新 Agent Session 的系统提示词，也不出现在该 Session 的 Skill commands；重新启用后新 Session 恢复。
- 已存在 Session 不被中断或热修改。
- 未知 ID、额外 IPC 参数、项目外路径和 symlink escape 被拒绝。
- Main settings、IPC contract、Renderer UI、资源装配均有回归测试。
- `pnpm check` 通过。
