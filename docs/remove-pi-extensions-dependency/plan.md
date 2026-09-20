# Plan: Remove the pi-extensions repository dependency

From `docs/remove-pi-extensions-dependency/spec.md`. Status: delivered 2026-09-20.

## Files that change

- `package.json`, `pnpm-lock.yaml`, `.gitignore`：删除 Git dependency、staging scripts 与资源配置。
- 删除 `scripts/{pi-extensions-config,prepare-pi-extensions,check-pi-extensions}.mjs` 和 bundled release license checker；调整 package/dev/release/smoke/SBOM 脚本。
- 删除 `electron/domains/chat/bundledResources.ts` 及 tests；修改 `piAdapter.ts`、`appState.ts`、`spireSettings.ts`、Settings service/tests。
- 修改 bindings/Settings/Memory UI 与测试，展示实际用户扩展并处理 pi-memory 未安装状态。
- 更新 README、THIRD_PARTY_NOTICES、CHANGELOG，以及历史 bundled/extension docs 的 superseded 标记和 public readiness 状态。

## Order of work

1. 先新增/调整测试，锁定“无 bundled resources 也能创建服务”和“用户显式资源仍加载”。
2. 将 runtime resource resolution 从 bundled merge 改为仅解析 pi + SpireCode 用户 settings；保留冲突 fail-fast。
3. 删除 built-in Settings candidates 和 bundled migration；调整 Memory 三态 UI。
4. 删除依赖、lockfile snapshot、staging/check scripts、extraResources 和 smoke 检查。
5. 移除 SBOM bundled 注入和 official release upstream license blocker；保留生产依赖 license policy。
6. 更新文档与 notices，全文搜索确认运行/构建代码不再引用该仓库。
7. 运行 clean install、targeted tests、`pnpm check`、audit、build、bundle 与 artifact inspection。

## Risks

- 七项能力不是 SDK built-in；移除 bundle 后必须诚实作为 breaking change，而不是静默宣称能力仍存在。
- `piAdapter` 当前通过 `additionalExtensionPaths` 和 `noExtensions:true` 实现隔离；迁移时既要保留用户显式配置，又不能意外恢复未经信任的目录自动扫描。
- Memory UI 与环境变量仍可能保留，但没有用户安装的 `pi-memory` 时不得表现为运行中。
- 删除构建脚本后需确认 `.gitignore`、CI、release 和 artifact smoke 不再引用已删除路径。

## Implementation status

Delivered. SpireCode no longer declares, downloads, stages, verifies, packages, loads, lists, or license-gates `github:klioen/pi-extensions`. Chat and model discovery use standard user Pi settings/resources; Extensions is a read-only view of resolved user resources; Memory reports not-installed/disabled/enabled states for an optional user extension. A clean frozen install, full gate, production build, macOS App/DMG smoke, dependency/URL scan, ASAR/resource inspection, SBOM, and notice scan passed.

This is a breaking capability change: web access, subagents, todo, plan, goal, memory execution, and SDLC skills are not SDK built-ins and must be installed by users through standard Pi configuration when needed.

## Proof

```bash
rg -n 'github:klioen/pi-extensions|codeload.github.com/klioen/pi-extensions' \
  package.json pnpm-lock.yaml scripts electron .github
pnpm install --frozen-lockfile
pnpm check
pnpm audit --prod --audit-level moderate
pnpm build
pnpm bundle
```

并检查最终 application resources 中不存在 `pi-extensions/`。
