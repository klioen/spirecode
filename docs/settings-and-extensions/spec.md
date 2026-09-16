# Spec: 设置中心与 Extensions 管理
Status: accepted。 Implements: `docs/settings-and-extensions/intent.md`。

## 1. 用户体验

右上角布局操作区增加 Settings 图标。点击后打开约 760 × 560px 模态框，左侧为 General、Agent、Extensions、Editor、Terminal 分类，右侧为内容区。Escape、关闭按钮和点击遮罩关闭模态框。

本次 Extensions 为完整功能页；其他分类展示现有设置或后续可配置项说明，不提供无效保存按钮。

## 2. Extension catalog

Main 根据当前 `worktreeId` 返回字段白名单 catalog：

- `~/.spirecode/extensions`：SpireCode global。
- `<worktree>/.spirecode/extensions`：SpireCode project。
- `~/.pi/agent/extensions`：Pi global。
- `<worktree>/.pi/extensions`：Pi project。
- `~/.pi/agent/settings.json` 与 `<worktree>/.pi/settings.json` 的 `extensions` 数组。
- 同一 settings 文件 `packages` 条目可展示为 package 配置项；package 中可解析出的 extension 入口纳入 catalog。

目录约定仅接受顶层 `.ts`/`.js`/`.mts`/`.mjs`/`.cts`/`.cjs` 文件及顶层目录内的 `index.*`。稳定 ID 由来源、作用域和规范化入口组成，不向 Renderer 暴露任意操作能力。

每项包含 id、name、source、scope、displayPath、enabled、status 与可选 error。

## 3. 开关语义

- 不移动、不删除 extension 文件。
- SpireCode 在自身 user data 的 `extension-settings.json` 中持久化 `id -> boolean` 覆盖。
- 默认启用已发现扩展。
- 当前版本的 Pi SDK 没有供宿主逐项切换已自动发现资源的稳定公共 API，因此 Main 在创建新 Agent session 时把禁用列表转换为资源加载过滤输入；若当前 SDK 无法安全注入，则 UI 明确标记“新会话生效”，并由 SpireCode 的会话创建边界应用过滤，而不篡改用户 Pi settings。
- 已存在会话不热卸载扩展。

## 4. IPC

新增 allowlist command：

- `settings_extensions_list { worktreeId }`
- `settings_extension_set_enabled { worktreeId, extensionId, enabled }`

参数严格校验。Main 仅允许 catalog 中已发现的 extension ID 被修改。

## 5. 安全

- 工作区路径只通过 ProjectService 的 `worktreeId` 解析。
- 项目扩展扫描不得跟随逃逸工作区的 symlink。
- settings 路径条目规范化后才能展示和建立 ID。
- DTO 严格字段白名单，不返回 Pi SDK 对象、配置内容、凭据或环境变量。
- UI 显示 Extensions 拥有本机代码执行权限的警告。

## 6. 验收

- Settings 按钮可打开和关闭模态框。
- Extensions 页能按来源和作用域列出扩展。
- 开关持久化，关闭后重新打开仍保持状态。
- 非法 ID、额外 IPC 参数及项目外路径被拒绝。
- `pnpm check` 通过。
