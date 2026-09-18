# Spec: Extensions 按系统内置与用户自定义分组
Status: accepted。 Implements: `docs/extension-catalog-sections/intent.md`。

## 1. 用户体验

Settings → Extensions 显示两个有标题和说明的区块：

1. **系统内置**：SpireCode 随应用携带并默认启用的 extension。
2. **用户自定义**：用户在 `~/.pi/agent/settings.json` 的 `packages` 或 `extensions` 数组中显式配置的 extension。

每项继续显示名称、启用状态和开关；变更提示为对新 Agent sessions 生效。系统内置项显示 `Built-in`，不向 Renderer 返回或展示 App bundle 的绝对路径。用户项可显示经过 home 缩写的配置来源/入口路径，不显示配置内容、凭据或环境变量。

用户自定义为空时只在该区块显示 empty state；系统内置六项必须始终存在，bundle 损坏属于 Chat 初始化错误而不是空列表。

## 2. 系统内置集合

默认 bundled extensions 严格为：

- `pi-web-access`
- `pi-memory`
- `pi-todo`
- `pi-subagents`
- `pi-goal`
- `pi-plan`

`pi-failover` 从构建 allowlist、运行时 bundled package names、manifest、App/DMG resources 和文档中移除。`pi-env` 不加入。`pi-sdlc` 仍可作为 bundled skills package存在，但不进入 Extensions catalog。

系统内置 catalog 从 Main 共享的 bundled package 定义派生，使用稳定 ID，并由 SpireCode 自有 `extension-settings.json` 保存启停覆盖。关闭 bundled extension 后，Main 在创建新 Agent session 前从 base paths 中移除对应 package root。

## 3. 用户自定义集合

Main 只读取全局 `~/.pi/agent/settings.json` 中显式声明的：

- `packages`
- `extensions`

不再把以下自动发现来源混入 Settings 的两个区块或由该页面管理：

- `~/.pi/agent/extensions/`
- `<worktree>/.pi/extensions/`
- `~/.spirecode/extensions/`
- `<worktree>/.spirecode/extensions/`
- `<worktree>/.pi/settings.json`
- `~/.spirecode/settings.json` 中的资源

Chat 当前明确加载的其他非冲突资源行为不在本次扩展范围内；本次 catalog 和开关只管理上述用户 Pi settings 来源与 bundled roots。用户配置了与 bundled package 同名的 package 时，继续去重，系统内置项是唯一可见和可加载实例。

Package 内多个 extension entries 使用相同 load root，开关按 package 整体更新。Standalone extension 独立启停。

## 4. DTO 与分类

`ExtensionSetting` 使用明确分类字段区分：

- `kind: "builtin" | "user"`

`source`/`scope` 不再承担 UI 分组职责；如为兼容 Main 内部发现仍保留，也不得让 Renderer 根据路径猜测分类。系统内置项 `displayPath` 使用安全产品文案或 package name，不返回 `process.resourcesPath`。

列表顺序固定为系统内置在前、用户自定义在后；各区块按稳定名称排序。

## 5. 安全和兼容性

- 所有路径解析、package manifest读取、ID 验证和开关过滤留在 Electron Main。
- Renderer 仍只通过 allowlisted typed IPC 使用 catalog。
- 不修改用户 Pi settings 或 extension 文件。
- 本次移除的 `pi-failover` 不迁移其旧 override；无效 override 可保留为无害历史状态，或在安全 schema migration 中清理。
- Extension 仍以当前 macOS 用户权限运行，UI 保留安全提示。

## 6. 验收

- Settings 显示“系统内置”和“用户自定义”两个区块。
- 系统内置恰好显示六项，且不显示内部 bundle 绝对路径。
- `~/.pi/agent/settings.json` 的 package 和 standalone extension 出现在用户区；自动发现目录和 project settings 不出现在该页面。
- 两类开关均持久化并影响新 Agent session 的 extension paths；package entries 整体启停。
- 同名 bundled/user package 只显示系统内置实例。
- staging checker、runtime bundle verifier 和 App/DMG smoke 均期望六个 extension packages加一个 skills package；`pi-failover` 不存在。
- `pnpm check`、bundle 和 smoke 通过。
