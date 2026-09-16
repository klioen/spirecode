# Spec: SpireCode bundled Pi resources
Status: accepted。 Implements: `docs/bundled-pi-extensions/intent.md`。

## Requirements

- 生产构建携带七个 extension packages 和一个 skills package 的完整运行文件。
- bundled resources 来自锁定的 `pi-extensions` Git commit，构建不依赖 `~/Code/pi-extensions` checkout。
- 开发态和正式版使用同一套 bundled resource 与 settings 行为。
- SpireCode 读取 `~/.pi/agent/settings.json` 作为基础配置，但不自动扫描 `~/.pi/agent/extensions/`、项目 `.pi/extensions/` 或项目 `.pi/settings.json` 中的 packages/extensions。
- SpireCode 使用 `~/.spirecode/settings.json` 作为开发态与正式版的覆盖配置：普通字段深度覆盖，packages/extensions 合并，跨层同名 provider 以 SpireCode 层为准。
- bundled package 不可被同名用户 package 重复加载；不同 package 的实际 tool、command 或 provider 注册重名时，在创建 AgentSession 前终止初始化并报告错误，不能静默覆盖。
- 模型认证、自定义模型和 durable sessions 继续复用 `~/.pi/agent`，不要求用户重新登录或迁移历史。
- `pi-memory` 数据继续写入其既有 `~/.pi/agent` 或环境变量覆盖目录，不写应用 bundle。
- 非冲突的用户 extensions、skills、prompts 和 themes 可以通过 `~/.spirecode/settings.json` 额外加载。

## Bundled resources

默认携带：

- `pi-web-access`
- `pi-subagents`
- `pi-todo`
- `pi-plan`
- `pi-goal`
- `pi-failover`
- `pi-memory`
- `pi-sdlc` skills

不携带：`pi-web`、`pi-lark`、`pi-env`。

## Design

### Locked source and packaging

SpireCode 依赖固定到 `https://github.com/klioen/pi-extensions.git` 的 commit `2933bcd5da9984b9758e9f3594790e98c4048115`。准备脚本从依赖中按 package allowlist 复制运行文件到 `.build/pi-extensions`，生成包含逐文件 SHA-256 的 `bundle-manifest.json`。Electron Builder 使用 `extraResources` 将目录复制到 `Contents/Resources/pi-extensions`，因此 `pi-memory/worker/worker.cjs` 位于 ASAR 外的真实文件系统。

开发启动和正式打包均先生成并校验同一 staging tree。运行时再次校验 manifest、package 集与文件 hash，损坏时阻止 Chat 初始化。

### Settings isolation

不能把 SDK `agentDir` 改成 `~/.spirecode`，因为这会同时迁移 auth、models 和 sessions。

SpireCode 分别读取 `~/.pi/agent/settings.json` 与 `~/.spirecode/settings.json`，普通字段递归合并且 SpireCode 值优先；删除合并结果中的 `packages` 与 `extensions` 后用 `SettingsManager.inMemory()` 创建 cwd-aware settings。两层 packages/extensions 保留来源和各自 settings 目录，合并后显式加载，因此相对路径不会因配置合并改变含义。项目 `.pi/settings.json` 仍不参与该配置层。

ResourceLoader 设置 `noExtensions: true`，关闭 Pi 全局和项目 extension 目录自动发现；bundled roots 与两层 settings 中的用户 package/extension sources 统一通过 `additionalExtensionPaths` 显式加载。项目 AGENTS.md 与 skills 继续按 Pi 标准发现。

### Conflict handling

加载前读取本地 package manifest；若 package name 与 bundled package 相同则忽略该用户 source并记录诊断。npm source 的明确同名 identity 同样被忽略。

不同 package 的内部注册名无法在不执行 extension factory 的情况下可靠获知。SDK 只执行一次 factory 后，SpireCode 通过 `extensionsOverride` 检查实际的 tool、command 和 extension provider registrations。跨 pi/SpireCode 两层出现同名 provider 时删除 pi 层 registration，确定性保留 SpireCode 层；tool/command、同层 provider 重名或 extension loader error 仍立即抛错，尚未创建 AgentSession，也不会进入 `session_start` 生命周期。

### Verification

- staging checker 验证八个 package、完整 hash、memory worker/prompts 和 SDLC skills。
- 单元测试验证独立 settings、同 package 去重和实际注册名冲突。
- 真实 ResourceLoader 隔离测试在 Pi 全局 settings、全局 extension 目录和项目 extension 目录放置探针，断言只有显式 SpireCode resource 被加载。
- App/DMG smoke 验证签名和最终 resources，并在 packaged Electron runtime 中加载 9 个 extension entry 与 5 个 SDLC skills。

## Constraints and accepted trade-offs

- 用户 package source 由 Pi 原生 package manager解析；本地相对路径相对于 `~/.spirecode/settings.json` 所在目录。
- extension factory 是受信任代码并会在冲突检查前执行注册阶段；冲突时不会创建 AgentSession，但 factory 顶层自行产生的副作用无法回滚。这与 Pi extension 的信任模型一致。
- tool/command/provider 冲突按 fail-fast 处理，不在本次增加 extension 管理 UI 或逐项启停机制。
