# Plan: SpireCode 默认携带并隔离 Pi extensions（from `docs/bundled-pi-extensions/spec.md` 2026-09-15）

## Files that change

- `package.json`、`pnpm-lock.yaml`：锁定 `pi-extensions` commit，增加资源准备命令和 Electron Builder `extraResources`。
- `.gitignore`、`eslint.config.js`：忽略生成的 `.build` staging tree。
- `scripts/pi-extensions-config.mjs`、`scripts/prepare-pi-extensions.mjs`、`scripts/check-pi-extensions.mjs`：维护 allowlist、生成逐文件 hash manifest 并校验资源。
- `scripts/electron-dev.mjs`、`scripts/package-electron.mjs`、`scripts/smoke-app.sh`：开发/发布统一准备资源并验证最终 App/DMG。
- `electron/domains/chat/spireSettings.ts` 及测试：读取 `~/.pi/agent/settings.json` base 与 `~/.spirecode/settings.json` override，使用内存 SettingsManager 应用合并结果。
- `electron/domains/chat/bundledResources.ts` 及测试：解析并校验 bundled resources，合并两层用户 sources，按各自 settings 目录解析相对路径，并让 SpireCode provider 覆盖跨层同名 provider。
- `electron/domains/chat/resourceIsolation.test.ts`：真实 SDK loader 隔离测试。
- `electron/domains/chat/piAdapter.ts` 及测试：把隔离 settings 与 resource options 注入 cwd-bound services，并拒绝加载错误。
- `docs/bundled-pi-extensions/{intent,spec,plan}.md`：记录边界、设计和实施证明。

## Order of work

1. 为独立 settings、bundled resolver、adapter 注入和真实 loader 隔离编写测试。
2. 锁定 `pi-extensions` Git commit，生成只包含八个 package 的 staging tree和 SHA-256 manifest。
3. 实现双 settings loader；普通字段以 SpireCode 层深度覆盖，移除 packages/extensions 后构造内存 SettingsManager。
4. 实现 bundled resolver：校验 bundle 完整性，合并 pi 与 SpireCode 用户 sources，保留来源及相对路径基准，并按 package identity 去除 bundled 重复项。
5. 使用 SDK `noExtensions: true` 关闭全局/项目目录自动发现，通过 `additionalExtensionPaths` 显式加载 bundled 与两层 settings 资源。
6. 在 SDK 单次执行 extension factories 后，以 `extensionsOverride` 让 SpireCode provider 覆盖跨层同名 provider；其他实际 tool/command/provider 冲突仍阻止创建 AgentSession。
7. 将 staging tree 作为 `extraResources` 放在 ASAR 外，接入开发、打包、签名和 smoke 流程。
8. 运行针对性测试、真实 SDK 探针、`pnpm check` 和 `pnpm bundle`。

## Risks

- 配置来源归属错误是首要风险；相对路径必须按所属 settings 文件解析，跨层 provider 覆盖必须只删除 pi 层 registration，不能放宽同层冲突。
- `pi-memory` 通过 `fork()` 启动 worker，必须保留 ASAR 外的真实文件路径。
- 任意 extension factory 可以在注册阶段产生副作用。当前只保证冲突发生时不创建 AgentSession、不进入 session lifecycle；不宣称能回滚第三方顶层副作用。
- 不把整个 `agentDir` 改成 `~/.spirecode`，否则会误迁移 auth/models/sessions。
- 不从 `~/Code/pi-extensions` 复制；固定 Git commit 的首次安装需要访问 Git remote。

## Proof

- 针对性测试：4 个文件、14 个测试通过。
- 真实 SDK staging 探针：加载全部 bundled extension entries 与 5 个 SDLC skills，且 0 个加载错误。
- `pnpm check`：format、brand、lint、两个 TypeScript project 和 41 个测试文件共 152 个测试全部通过。首次完整运行出现一次未改动 filesystem watcher 的 5 秒超时；该用例单独重跑通过，随后完整检查通过。
- `pnpm bundle`：最终代码完成构建、Electron packaging、自定义签名、App smoke 和 DMG smoke。
- 最终 App resource checker 验证 7 个 bundled packages（六个 extensions + `pi-sdlc`），`pi-memory` worker 为 ASAR 外普通文件；产物位于 `release/mac-arm64/SpireCode.app` 和 `release/SpireCode-0.1.0-arm64.dmg`。
