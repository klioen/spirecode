# Spec: Remove the pi-extensions repository dependency
Status: accepted. Implements: `docs/remove-pi-extensions-dependency/intent.md`.

## 1. Dependency and build removal

- 删除 `package.json` 中 `pi-extensions` Git dependency，并通过 pnpm 更新 lockfile；最终 lockfile 不得包含该 GitHub URL、tarball 或 package snapshot。
- 删除 `prepare:pi-extensions`、`check:pi-extensions` scripts，以及对应脚本/config。
- `pnpm dev` 与 `pnpm bundle` 不再生成或读取 `.build/pi-extensions`。
- Electron Builder 不再把 `pi-extensions` 放入 `extraResources`。
- App/DMG/Windows/Linux smoke 不再检查 bundled Pi packages；仍检查 pi SDK、native modules、legal resources 和 GUI 启动。
- SBOM 不再注入 bundled Pi package manifest，只包含真实 production dependency tree。

## 2. Runtime resource loading

- 删除 `electron/domains/chat/bundledResources.ts` 及其 bundled constants、manifest verifier和 precedence 逻辑。
- `createPiAdapter()` 使用 `loadSpireSettings()` 与 pi SDK `DefaultResourceLoader`/package manager 加载用户显式配置的 resources。
- 禁止自动扫描任意扩展目录的安全策略可保留，但必须支持标准 pi settings 中的 package/extension 声明；不得依赖 bundled root。
- provider precedence 仅适用于 pi settings 与 SpireCode settings 两层；SpireCode 层同名 provider优先，其他 tool/command/provider 冲突 fail fast。
- `AppState.listModels()` 和 readiness 使用与 Chat 相同的用户 resource paths。

## 3. Settings and UI

- Settings catalog 不再构造 `builtin:*` candidates，也不硬编码 package names、source commit 或权限。
- 用户声明的 package/extension 根据解析结果展示；既有 `kind` DTO 可收敛为 user-only，或保留兼容字段但不得产生 built-in 项。
- 删除新安装 bundled 默认值和 v5 bundled override migration；旧 hash overrides 可保留为无害历史数据或在 schema migration 中清理。
- Extensions 页面不再显示“System built-in”列表；显示用户 extensions/packages 和配置来源。
- 无项目时仍可管理/查看 global user resources；项目资源是否加载继续遵守明确 trust policy。
- 高权限确认只在有可靠 capability metadata 时显示；未知第三方扩展统一说明其为可执行代码，不伪造细粒度权限。

## 4. Memory behavior

- `MemoryConfig` 继续保持 provider-neutral `null` 默认。
- `MemoryService` 继续只读 `~/.pi/agent/memories`，不依赖 extension package。
- Settings 检测实际用户 catalog 中是否存在并启用 `pi-memory`：
  - 不存在：显示“Pi Memory extension is not installed”；配置控件可保留但明确不会运行。
  - 存在但 disabled：显示 disabled 提示。
  - 存在并 enabled：按当前行为配置 phase models/reasoning。
- AppState 只在存在有效 MemoryConfig 时设置环境变量；这些变量供用户安装的 `pi-memory` 使用。
- Chat 对历史/实时 `pi-todo-state` 自定义 entry 的解析保留，以兼容用户安装 `pi-todo` 的会话。

## 5. Documentation and release policy

- README 不再称任何 extension/skill bundled；改为列出 SDK 基础能力和可选用户安装能力。
- `docs/bundled-pi-extensions/*` 和 `docs/extension-catalog-sections/*` 标记 superseded，并指向本变更；历史设计保留，不篡改历史事实。
- `docs/public-open-source-readiness/*` 删除 `pi-extensions` 上游许可证作为当前 blocker，并改为“不分发该仓库代码”。
- THIRD_PARTY_NOTICES 重新生成/更新，不再出现 `pi-extensions (dev) Unknown`。
- official release 不再调用 bundled repository license checker；生产 license metadata gate仍保留。

## 6. Acceptance

- `rg 'github:klioen/pi-extensions|codeload.github.com/klioen/pi-extensions' package.json pnpm-lock.yaml scripts electron .github` 无结果。
- clean `pnpm install --frozen-lockfile` 不访问该 repository。
- `pnpm dev`、`pnpm check`、`pnpm bundle` 不需要 `.build/pi-extensions`。
- 最终 App resources 不包含 `pi-extensions/`。
- Chat 在无用户扩展时可使用 SDK 基础 coding tools；无认证时 readiness 引导仍正常。
- 用户 settings 显式配置 extension/package 时可被加载和展示。
- 未安装/关闭/启用 pi-memory 三种 UI 状态有测试。
- `pnpm audit --prod --audit-level moderate`、`pnpm check`、production build 和目标平台 smoke 通过。

## 7. Compatibility concerns

- 本变更会移除开发构建中原本默认可用的 web/subagent/todo/plan/goal/memory/SDLC 能力，必须在 README 和 release notes 中明确 breaking change。
- 用户 settings 的 object-form package filters 需要交给 SDK 解析；若现有 `loadSpireSettings` 只支持 string，应在本变更补齐或明确先支持 SDK标准对象形式。
- 不应保留以 `pi-*` 名字伪装的空 built-in 项；UI 必须反映实际加载结果。
