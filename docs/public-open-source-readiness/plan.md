# Plan: SpireCode public open-source readiness

From `docs/public-open-source-readiness/spec.md`. Status: implemented; formal public binary release remains blocked on signing credentials and target-platform release verification. The former `pi-extensions` upstream-license blocker is resolved by removing that repository dependency and distributing none of its code.

## Delivery strategy

使用一个总体目标、九个可独立 review/merge 的阶段。每阶段先写失败测试或静态 guard，再改实现；主分支始终保持可构建。法律授权、application identity 和签名凭据没有获批时，相关阶段不得自行猜测，但其他阶段可并行推进。

建议 PR 顺序：

1. untrusted repository security
2. diagnostics privacy
3. license and notice machinery（法律文本待 gate）
4. onboarding and extension trust
5. application identity migration（identifier 待 gate）
6. dependency/supply-chain gates
7. community documentation
8. signed tagged release pipeline（凭据待 gate）
9. stability/performance closure and final audit

## Phase 0 — Record owner decisions

### Files that change

- `docs/public-open-source-readiness/intent.md`
- `docs/public-open-source-readiness/spec.md`
- 可选 `TRADEMARKS.md` 或 owner 决策记录

### Work

1. 确认 L1/L2/B1/A1/X1/R1。
2. 将接受的 intent/spec 状态更新为 accepted。
3. 对无法立即提供的签名凭据记录 owner、交付日期和明确的 blocked acceptance；不将其降级为“可选”。

### Proof

- owner review/commit history 可定位每个决策；无 unresolved legal decision 时才进入公开发布。

## Phase 1 — Harden untrusted repository operations

### Files that change

- `electron/core/gitProcess.ts`
- `electron/core/gitProcess.test.ts`（新增）或现有 Git domain tests
- `electron/domains/git/service.ts`
- `electron/domains/git/git.test.ts`
- `electron/domains/worktrees/index.ts`
- `electron/domains/worktrees/worktrees.test.ts`
- `AGENTS.md`
- threat-model/public security documentation

### Order of work

1. 建立临时恶意仓库 fixture，分别配置 fsmonitor、external diff、textconv/filter marker；确认当前 fsmonitor 测试先失败。
2. 抽取跨平台 `safeGitConfig` 和安全 query args；为所有 read/status/diff/worktree 调用建立调用点清单。
3. 禁用 `core.fsmonitor`，对 diff 使用 `--no-ext-diff`/no-textconv，保持 hooks/credential/ext protocol 保护；使用跨平台 empty hooks directory。
4. 运行正常 Git 和 worktree tests，确认不影响 branch、rename、untracked 和 binary diff 行为。
5. 将“仓库级 Git 可执行配置必须显式禁用”写入 `AGENTS.md`，防止后续绕过统一 runner。

### Risks

- 禁用 fsmonitor 可能影响大型仓库性能；这是安全换性能的明确选择。
- 不能全局使用 `GIT_CONFIG_NOSYSTEM` 或忽略所有 user config，否则可能破坏用户代理、safe.directory 和正常 Git 行为。

### Proof

```bash
pnpm exec vitest run electron/core/gitProcess.test.ts electron/domains/git/git.test.ts electron/domains/worktrees/worktrees.test.ts
pnpm check
```

## Phase 2 — Diagnostics and filesystem hardening

### Files that change

- `electron/domains/diagnostics/service.ts`
- 新增/扩展 diagnostics tests
- `electron/domains/filesystem/pathGuard.ts`
- `electron/domains/filesystem/service.ts`
- `electron/domains/filesystem/filesystem.test.ts`
- `electron/main.ts` 及其他 diagnostics call sites
- `PRIVACY.md`
- `SECURITY.md` threat-model section

### Order of work

1. 先建立 secret/path corpus 测试，证明现有 denylist 会泄露 Bearer/JWT/private key/绝对路径。
2. 定义结构化 diagnostic event union；调用点只传 error code 和 allowlisted context，未知异常仅记录类型化 fallback。
3. Copy diagnostics 对路径 placeholder 化，并保留最后 64 KiB/rotation 边界。
4. 为 read/write 增加 descriptor-based/no-follow 与替换前二次校验；先实现跨平台稳定的风险降低，不引入 native addon。
5. 增加 symlink swap race fixture；无法完全确定性模拟的平台记录限制并 fail closed。
6. 更新 Privacy/Security 使承诺严格等于测试覆盖。

### Risks

- 改造日志接口会影响所有错误处理路径；应先保留兼容 adapter，再逐个收紧。
- Windows 对 symlink 和 open flags 的行为不同；不得只在 macOS 验证。

### Proof

```bash
pnpm exec vitest run electron/domains/diagnostics electron/domains/filesystem
pnpm check
```

并在三平台 CI 运行 filesystem tests。

## Phase 3 — Licensing and notices

### Files that change

- `LICENSE`（仅 L1 批准后）
- `TRADEMARKS.md`（如 B1 要求）
- `package.json`
- `THIRD_PARTY_NOTICES.md`
- notices 生成/检查脚本
- `scripts/smoke-app.sh`
- `scripts/smoke-packaged-app.mjs`
- `.github/workflows/ci.yml`
- production artifact tests

### Order of work

1. 删除 `github:klioen/pi-extensions` dependency、staging、manifest 和 artifact 内容；不复制或伪造其上游授权。
2. L1 后替换根许可证并更新 package metadata。
3. 使用脚本从 lockfile 和实际分发内容生成 notices；生成器拒绝 Unknown、缺失 source 或 incompatible production license。
4. Electron builder 将本项目 LICENSE/NOTICE/Privacy 放入 resources；三平台 smoke 解包验证，并断言不存在已移除的 Pi bundle。
5. CI 增加 deterministic regeneration diff gate。

### Risks

- `pnpm licenses list` 只覆盖 package metadata，不代表全部资产授权；Remix Icon、应用图标、bundled prompts/skills 需单独核对。
- 自动生成 notices 不能替代法律 owner 的兼容性判断。

### Proof

```bash
pnpm licenses list --prod
pnpm check
pnpm bundle
```

最终 artifact 中存在 `LICENSE`、`THIRD_PARTY_NOTICES.md` 和所有实际分发依赖要求的 notices，且不存在 `pi-extensions/`。

## Phase 4 — First-run, authentication and extension trust

### Files that change

- `electron/contracts.ts`
- `electron/ipc.ts`、`electron/preload.ts` 及测试
- `electron/domains/chat/piAdapter.ts`
- `electron/domains/models/modelCatalog.ts`
- `electron/domains/settings/index.ts`
- `electron/domains/chat/bundledResources.ts`
- `src/bindings/*`
- `src/features/settings/SettingsDialog.tsx`、store/API/tests
- 新增 onboarding feature/components/tests
- `src/features/chat/*` auth/setup state tests
- `src/i18n/en.ts`、`src/i18n/zh-CN.ts`
- README/setup docs

### Order of work

1. 先定义不含 credential 的 `AgentReadiness` DTO 和 IPC validation tests。
2. Main 从 ModelRuntime/ModelCatalog 派生 provider/auth/model 状态，Renderer 不能传路径或请求 secret。
3. clean profile 下先显示 setup/trust UI；增加 refresh，而不是直接尝试失败 run。
4. Settings catalog 只展示通过标准 Pi settings 配置和解析到的用户资源，不再生成 built-in choices；安全迁移旧 bundled override。
5. 无用户资源时保持 SDK 基础 Agent 能力；第三方资源由用户自行安装和作出信任决定。
6. `MemoryConfig` 支持 unconfigured；未安装用户 `pi-memory` 时明确提示，移除 TraeX 默认，新旧配置迁移分别测试。
7. auth-required Chat 错误跳转/聚焦 setup，并提供官方安装认证文档链接。

### Risks

- SDK 当前 auth API 能力需要以实际源码为准；若无法枚举 provider，只返回已验证能力，不从凭据文件猜测。
- 不得在 onboarding 中收集/显示 API key。

### Proof

- 使用隔离 `HOME`/agent dir 的测试覆盖：无配置、无认证、有认证、默认模型失效、资源损坏。
- 组件测试覆盖首次同意、拒绝、重复启动、升级用户、新 extension。
- `pnpm check` 全绿；手工 clean-profile smoke 完成 setup → external pi auth → refresh → Chat。

## Phase 5 — Production identity and migration

Status: delivered 2026-09-19 for the shared Electron implementation and macOS artifact smoke. Cross-platform metadata is supplied by electron-builder's shared `appId`; workflow changes remain outside this phase's approved implementation scope.

### Files that change

- `package.json`
- `electron/main.ts`
- `electron/applicationIdentity.ts`
- `electron/applicationIdentity.test.ts`
- `scripts/smoke-app.sh`
- 本 spec/plan 的 Phase 5 状态记录

### Order of work

1. A1 批准后集中定义 application identity，避免多处字符串漂移。
2. 先写 old-only、new-existing、retry、copy failure、invalid state 和 explicit override tests。
3. 实现同卷 temporary copy + validation + atomic rename + marker；保留安全 fallback。
4. 更新三平台 bundle metadata 和 smoke assertions。
5. 手工使用旧版生成的真实测试 profile 验证迁移，不接触开发者真实 userData。

### Risks

- 这是最可能造成“项目消失”的阶段；迁移不得和 Settings schema 大改合并。
- macOS bundle identifier 变化会影响 Keychain/signing/update continuity，应和认证存储行为一起验证。

### Proof

- migration unit/integration tests 全绿。
- 旧版 fixture 启动后 catalog/settings 保留；第二次启动不重复迁移。
- 三平台 artifact metadata 使用批准 identifier。

## Phase 6 — Dependency and supply-chain controls

### Files that change

- `package.json`、`pnpm-lock.yaml`（按批准升级）
- `.github/dependabot.yml` 或 Renovate config
- `.github/workflows/ci.yml`
- 新增 audit exception schema/checker
- SBOM/provenance scripts

### Order of work

1. 升级 Monaco/DOMPurify 链或使用最小 override，先用 editor/Markdown/security tests 验证无回归。
2. 将 audit 从 `continue-on-error` 改为 moderate 阻断；若确需例外，要求 advisory、owner、expiry、rationale 精确匹配。
3. 添加 dependency update automation，限制更新频率并要求完整门禁。
4. Actions 引用固定 commit SHA。
5. 生成真实 npm production tree 和其他实际分发内容的 SBOM；不注入已移除的 Pi package manifest，并验证 reproducibility。
6. 增加 secret scan；历史扫描结果由 maintainer 复核，发现真实 secret 时先 revoke 再清理历史。

### Risks

- transitive override 可能与 Monaco 声明范围不兼容；优先升级直接依赖。
- Actions SHA pinning 需要维护自动更新，否则会长期陈旧。

### Proof

```bash
pnpm audit --prod --audit-level moderate
pnpm check
```

SBOM 包含 Pi SDK、node-pty、Monaco 和其他实际 production dependencies，不包含用户安装资源或已移除的 `pi-extensions` packages，且无 credential。

## Phase 7 — Community and public documentation

### Files that change

- `README.md`
- `SECURITY.md`
- `CONTRIBUTING.md`
- `CODE_OF_CONDUCT.md`
- `SUPPORT.md`
- `CHANGELOG.md` 或 release-note config
- `.github/ISSUE_TEMPLATE/*`
- `.github/pull_request_template.md`
- `.github/CODEOWNERS`（owner 批准后）
- `PRIVACY.md`
- docs index / threat model

### Order of work

1. 写平台矩阵、安装状态、build prerequisites 和 provider setup。
2. 写 security private reporting channel；若暂无专用邮箱，先由 owner 创建，不能用公开 issue 代替。
3. 写贡献流程并引用 `docs/<slug>/{intent,spec,plan}`、`pnpm check` 和 security expectations。
4. 增加 issue forms/PR checklist/CODEOWNERS。
5. 用 fresh clone 文档演练验证每条命令和链接。

### Risks

- 文档不能提前写“signed/notarized/secure”来代替流水线证明。
- 公开安全联系方式必须是维护者实际监控的渠道。

### Proof

- Markdown/link check。
- fresh clone 在三个 OS 按 README 完成 install/check；clean user profile 能理解认证流程。

## Phase 8 — Signed tagged release pipeline

### Files that change

- `.github/workflows/release.yml`（新增）
- `.github/workflows/ci.yml`
- `scripts/package-electron.mjs`
- `scripts/sign-electron-app.sh` 或平台签名模块
- 新增 notarize/sign/checksum/release verification scripts
- `package.json`
- release documentation

### Order of work

1. 先实现无 secret 的 dry-run workflow：exact tag、version consistency、三平台 build/smoke、checksums/SBOM/provenance、draft release。
2. 配置受保护 GitHub Environment 和 required reviewers。
3. 集成 Apple Developer ID/notary；验证 `codesign`、`spctl`、`stapler`。
4. 集成 Windows Authenticode；验证 installer 和 executable chain。
5. 增加 installer install/launch/uninstall smoke。
6. 仅全部验证通过才 publish；失败保留日志但不发布资产。
7. 做一次 prerelease candidate，再做正式 `v0.1.0`（或 owner 选择版本）。

### Risks

- fork PR 不应获得 signing secrets；PR 只跑 unsigned verification，tag workflow 才进入 protected environment。
- notarization 和 signing service 可能暂时不可用；不得 fallback 发布 unsigned artifact。

### Proof

- GitHub Release 中 source tag、version、SHA-256、SBOM、provenance 一致。
- macOS Gatekeeper/notarization 和 Windows signature verification 成功。
- 三平台 clean VM 安装、启动、卸载通过。

## Phase 9 — Stability, performance and final audit

### Files that change

- `src/features/editor/EditorPane.test.tsx` 及根因对应 production/test setup 文件
- `vitest.config.ts`（仅根因要求时）
- `src/app/monacoSetup.ts`、editor loading code（若拆包）
- performance/smoke scripts
- 本目录 intent/spec/plan 状态
- `AGENTS.md`（仅重复问题形成稳定规则时）

### Order of work

1. 使用随机顺序/重复运行复现 conflict reload flake；检查 keyboard listeners、mock resolved-once queue、store/draft cache teardown。
2. 先固定失败回归，再修生产 race 或测试隔离根因；禁止 blind retry。
3. 修正 Monaco static+dynamic import 冲突，记录 renderer chunk/startup/memory 基线。
4. 对整个 diff 执行 Bugs/Security/Compliance 三遍 review。
5. 在 clean clone、clean user profile、三平台 artifacts 上执行最终 acceptance matrix。
6. 只有所有 owner gates 和 release proofs 完成后，将 intent/spec/plan 状态标为 delivered。

### Proof

```bash
for i in 1 2 3 4 5; do pnpm test || exit 1; done
pnpm check
pnpm audit --prod --audit-level moderate
pnpm bundle
```

此外完成 license scan、secret scan、SBOM validation、artifact signature verification 和 clean-profile onboarding smoke。

## Cross-phase review requirements

每个 PR 均执行三遍 review：

- **Bugs：** 数据迁移、配置兼容、跨平台路径、取消/失败恢复。
- **Security：** IPC sender/args、secret handling、untrusted repository、artifact provenance。
- **Compliance：** 对照本 spec，确保文档不提前宣称未交付能力。

任何阶段新增 Renderer capability、credential handling、任意路径参数、shell string 或 unsigned-release fallback 都必须停止并重新获得 owner review。

## Implementation status

Repository implementation completed 2026-09-19. Local quality, audit, build, macOS development bundle, App smoke, DMG smoke, legal-resource packaging, application identity migration, Agent readiness/onboarding, provider-neutral Memory defaults, user-resource trust messaging, untrusted Git regression protection, structured diagnostics, conflict-safe file writes, release workflow, SBOM, and fail-closed tests pass. The release workflow also contains target-native Windows installer and Linux AppImage/deb verification, which must be exercised by target-hosted CI.

The breaking removal of `github:klioen/pi-extensions` eliminates the former upstream redistribution-license blocker: SpireCode no longer downloads, stages, or ships that repository's code. Users who need web, subagents, memory, todo, plan, goal, SDLC, or other resources install and declare them through standard Pi settings. Production license gates continue to cover everything SpireCode actually distributes.

Formal public binary publication remains intentionally blocked until (1) the legal owner reviews and approves the generated production dependency inventory plus Electron/Chromium notices included in the final artifact, and (2) repository owners configure protected `release-signing` / `release-publish` environments and valid Apple Developer ID/notary and Windows Authenticode credentials, then complete one release-candidate run on GitHub-hosted target platforms.

## Completion definition

“大计划完成”不是文件都改过，而是：

- 六个 owner gate 均已决策；
- 所有 acceptance criteria 有自动化或可重复人工证据；
- 正式 tag artifact 可验证 license、signature、notarization、checksums、SBOM、provenance；
- fresh user 能完成 setup；
- 不可信仓库 fixture 无命令副作用；
- 三平台质量门禁和多轮稳定性测试全绿；
- 文档与真实能力完全一致。
