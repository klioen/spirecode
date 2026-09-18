# Plan: Extensions 按系统内置与用户自定义分组（from `docs/extension-catalog-sections/spec.md` 2026-09-18）

## Files that change

- `docs/extension-catalog-sections/{intent,spec,plan}.md`：记录本次独立目标、边界、设计与实施证明。
- `scripts/pi-extensions-config.mjs`：从 bundled allowlist 移除 `pi-failover`，保留六个 extension packages 与 `pi-sdlc` skills。
- `electron/domains/chat/bundledResources.ts` 及测试：运行时集合移除 `pi-failover`，并导出可供 Settings catalog 复用的 bundled metadata，避免 UI/Settings 复制另一份名称清单。
- `electron/domains/settings/index.ts` 及测试：catalog 增加 builtin/user 分类；系统内置项从 bundled metadata 构造；用户项只解析全局 Pi settings 中显式 packages/extensions；开关继续持久化并正确过滤 bundled package root 或用户 load root。
- `src/bindings/generated.ts`：DTO 增加严格的 `kind` 分类字段。
- `src/features/settings/SettingsDialog.tsx` 及测试：按“系统内置”“用户自定义”分区渲染，增加局部 empty state，系统项不展示内部路径。
- `src/styles/index.css`：增加 extension section 标题、说明与间距样式。
- `docs/bundled-pi-extensions/{intent,spec,plan}.md`：同步已交付架构文档中的最终 bundled 集合和验证数量，避免文档继续声称包含 failover。
- `pnpm-lock.yaml`：仅当重新安装依赖或打包流程确实产生必要变化时更新；预计无需变更固定 pi-extensions commit。

## Order of work

1. 先增加/调整 Main 单元测试，锁定系统内置恰好六项、用户配置来源边界、同名 package 去重、两类开关过滤和不泄露 bundle 绝对路径。
2. 建立唯一 bundled metadata 定义，让打包脚本与 runtime/Settings 使用一致的 package identity；从所有构建和运行时集合移除 `pi-failover`。
3. 重构 Settings catalog：显式组合 builtin candidates 与 `~/.pi/agent/settings.json` 解析出的 user candidates，不再使用会混入自动发现和 project settings 的通用 `SettingsManager.create(cwd, agentDir)` catalog 结果。
4. 更新 typed DTO 与 Renderer，按 `kind` 分组；增加两个标题、说明和用户区 empty state，保留新会话生效提示及开关交互。
5. 重新生成 `.build/pi-extensions`，运行 checker，确认 manifest 只有六个 extension packages和 `pi-sdlc`，并确认 `pi-failover` 文件不存在。
6. 同步 bundled extension 文档中的清单、数量与 smoke 预期。
7. 运行 targeted tests、`pnpm check`、`pnpm bundle`、`pnpm smoke:app` 和 `pnpm smoke:dmg`。

## Risks

- **最危险：catalog 与实际加载集合漂移。** 如果 UI 自己硬编码六项，未来打包集合变化时会出现可见但未加载或已加载但不可见。通过共享 Main-side bundled metadata 和 contract tests 防止漂移。
- **过滤错误导致内置扩展无法关闭或全部被关闭。** 当前 `enabledPaths` 以 resolved entry 为主，builtin catalog 改为 package 级项后必须以 canonical load root/package name匹配，并测试只移除目标 package。
- **误读取 project/auto-discovered extensions。** 不再依赖 cwd-aware 通用 package manager生成 catalog；用户区仅使用明确的 global Pi settings path，同时保持路径 canonicalization、symlink 与 package identity校验。
- **移除 failover 改变 API key轮换行为。** 这是用户明确接受的产品能力移除；测试和 smoke 必须证明其他六项仍全部加载。
- 不采用纯 Renderer 分组，因为 Renderer 不应根据 `source`、路径字符串或 package 名推断安全边界；分类由 Main 返回。

## Proof

- Settings domain tests：六个 builtin、用户 settings package/extension、排除自动目录/project settings、同名去重、package 整体开关、builtin 单独开关、稳定 ID、安全 displayPath。
- Bundled resources tests：expected names不含 `pi-failover`，manifest/hash 校验和重复 package过滤继续通过。
- Renderer tests：两个区块、各自内容、用户 empty state和开关 IPC。
- `pnpm prepare:pi-extensions && pnpm check:pi-extensions` 输出 7 个 bundled packages（六个 extension packages + `pi-sdlc` skills package），且 `test ! -e .build/pi-extensions/pi-failover`。
- `pnpm check` 全量通过。
- `pnpm bundle`、`pnpm smoke:app`、`pnpm smoke:dmg` 通过，最终 App resources不含 `pi-failover`。
