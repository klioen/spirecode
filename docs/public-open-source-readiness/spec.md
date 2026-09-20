# Spec: SpireCode public open-source readiness
Status: accepted. Implements: `docs/public-open-source-readiness/intent.md`.

## 1. Scope and delivery model

本变更是一个统一目标下的分阶段项目，可拆成多个 PR，但以本目录三件套为唯一总体基线。

### Included

- 开源许可证、版权、品牌资产声明和第三方再分发合规。
- 不可信 Git 仓库配置加固及 filesystem symlink-race 风险收敛。
- diagnostics 结构化日志与隐私承诺校准。
- provider-neutral 首次启动、认证状态和扩展权限确认。
- application identifier 与既有 userData 的幂等迁移。
- dependency audit、license gate、SBOM、checksums、provenance 和正式 release workflow。
- macOS/Windows 正式签名集成及无凭据 fail-closed 行为。
- 社区治理、安装、支持平台、威胁模型和贡献文档。
- 已知 EditorPane conflict test 稳定性调查与回归保护。

### Excluded unless separately approved

- 自建账号系统或由 SpireCode 保存 provider API key。
- worktree/Agent 的 OS 级 sandbox。
- 自动更新器和更新服务。
- macOS Intel、Windows arm64、Linux arm64 新目标。
- Homebrew/winget/apt repository 发布；首批最低渠道是 GitHub Releases。
- 以关闭测试、重试 flaky test 或 `continue-on-error` 掩盖门禁失败。

## 2. Approved decisions

Owner 于 2026-09-19 批准以下实施决策：

| Gate | Approved decision |
| --- | --- |
| L1 | SpireCode 采用 Apache-2.0；copyright holder 使用实际项目权利主体 |
| L2 | 仅实际随 SpireCode 分发的依赖和资源必须具有兼容的明确 SPDX license；`github:klioen/pi-extensions` 不再下载、打包或进入 artifact |
| B1 | 增加 `TRADEMARKS.md`，代码许可证不授予品牌商标权 |
| A1 | production app identifier 使用 `io.github.klioen.spirecode` |
| X1 | `pi-web-access`、`pi-subagents`、`pi-memory` 对新用户默认关闭并首次显式同意 |
| R1 | Apple/Windows signing 使用 GitHub protected environment + required reviewers；缺少凭据时正式发布 fail closed |

## 3. Licensing and distributable contents

### Repository licensing

- 根 `LICENSE` 必须是 owner 批准的完整 OSI license，不得继续保留 proprietary/confidential 文案。
- `package.json` 增加准确的 SPDX `license`、`repository`、`bugs` 字段；`private: true` 可保留以防误发 npm。
- README 清晰展示 license；品牌不随开源许可证授权时增加 `TRADEMARKS.md`。
- 贡献采用 inbound=outbound，除非 owner 明确要求 CLA/DCO；选择必须写入 `CONTRIBUTING.md`。

### Third-party and runtime resources

- SpireCode 不下载、stage、vendor 或分发 `github:klioen/pi-extensions`；因此该上游仓库的 license 状态不再阻断 SpireCode release。
- `THIRD_PARTY_NOTICES.md` 由固定 lockfile 和实际分发内容生成，不手工维护为唯一事实来源；生成后必须无 unknown/invalid production license。
- 用户通过标准 Pi settings 安装的 packages、extensions、skills、prompts 和 themes 不属于 SpireCode artifact；其来源、许可证和信任评估由用户负责。
- 最终 app/installer 必须携带 SpireCode LICENSE、THIRD_PARTY_NOTICES、Privacy Notice 和实际 bundled runtime dependency 所需的 license/notice。
- CI 解包 artifact 并断言上述文件存在、hash 匹配。

## 4. Untrusted repository security

### Git process policy

所有由 SpireCode 发起的 Git 命令通过同一 hardened runner。runner 必须：

- 保持 `shell: false`、参数数组、timeout 和 output limit。
- 禁止 hooks、credential helpers 和 `protocol.ext`。
- 禁止 `core.fsmonitor` 执行外部程序。
- diff 命令使用 `--no-ext-diff`，并禁止 external diff/textconv；不执行仓库声明的 diff driver command。
- 不设置或调用 repository pager/editor/sequence editor。
- 对可能运行 filter/process/submodule helper 的 Git 操作建立 allowlist；当前产品不需要的能力明确拒绝。
- 空 hooks path 使用跨平台真实空目录，而不是依赖 `/dev/null` 在 Windows 上的语义。

回归 fixture 应在临时仓库中配置 `core.fsmonitor`、external diff、textconv/filter 等 marker scripts，执行所有产品 Git 查询后断言 marker 未产生。测试不得运行网络或真实 credentials。

### Filesystem race hardening

- 继续使用 `worktreeId + relativePath`、拒绝绝对路径/`..`/`.git` 和 canonical containment。
- 读取使用 no-follow open（平台支持时）并基于 file descriptor 执行 `fstat` 和读取；验证 regular file、size 和最终 inode。
- 写入在已验证父目录内创建 exclusive temporary file，替换前重新验证父目录和 target identity/version；若平台无法提供 fd-relative rename，则采用二次 canonical/inode 校验并在变化时 fail closed。
- Windows/macOS/Linux 差异必须由平台测试覆盖；不以破坏正常 symlink-in-worktree UX 的方式假装完全消除 race。
- threat-model 文档明确剩余边界：同一 OS 用户仍可在操作期间修改目录，Agent 本身不是 confinement boundary。

## 5. Diagnostics and privacy

- 应用日志改为 `{timestamp, level, code, safeContext}` 的结构化记录；业务层只提供 allowlisted scalar，不记录任意 error object、stack、prompt、tool args/result、环境变量或文件正文。
- 路径必须归一化为 `<home>`、`<worktree>`、`<appData>`；未知绝对路径不进入 Copy diagnostics。
- token/JWT/Bearer/private-key/high-entropy 检测作为 defense-in-depth，不替代 allowlist。
- Copy diagnostics 仅包含版本、平台、架构、Electron/Node 版本和有界结构化事件。
- 测试注入 API key、Bearer、JWT、URL credentials、JSON token、私钥、home/worktree path 和 multiline error，断言输出不包含原值。
- `PRIVACY.md` 只承诺测试可证明的内容，并说明 diagnostics 由用户主动复制、不会自动上传。

## 6. First-run and trust onboarding

### Agent readiness state

Main 提供窄化 read-only readiness DTO，不暴露 credential 内容：

```ts
interface AgentReadiness {
  piAgentDirectoryExists: boolean;
  authenticatedModelCount: number;
  availableProviders: Array<{ id: string; authenticated: boolean }>;
  defaultModelAvailable: boolean;
  userResourcesHealthy: boolean;
}
```

- 首次启动和 Chat auth failure 都可刷新该状态。
- SpireCode 不读取或返回 API key；认证继续由 pi 官方流程管理。
- UI 提供可复制的 CLI 安装/登录说明和官方文档链接，并在完成后允许“重新检测”。
- 没有 authenticated model 时，不创建一个注定失败的 run；Chat 显示明确的 setup state。

### Extension trust

- SpireCode 不构造 built-in extension catalog，也不为用户预装或默认启用第三方 Pi resources。
- 用户通过标准 Pi settings 显式安装和声明 packages、extensions、skills、prompts 与 themes；Settings 只反映实际配置和解析到的用户资源。
- UI 说明 Agent 和 executable resources 使用当前 OS 用户权限，worktree 不是 sandbox，并要求用户在安装前审查来源、许可证与能力。
- 用户可在 Settings 查看已配置资源及启用状态；变更对新 Agent sessions 生效。
- 升级用户原先依赖 web/subagents/memory/todo/plan/goal/SDLC bundled 能力时，必须自行安装替代资源；这是明确记录的 breaking change。

### Provider-neutral Memory

- `MemoryConfig` 不再将 `traex/DeepSeek-V4-Flash` 作为新安装默认值。
- 未配置状态是合法 DTO；启用 memory 前要求为 Phase 1/2 选择当前已认证模型。
- 迁移保留已有用户的显式配置，不静默替换其 provider/model。
- model unavailable 时保持原值并明确提示，不 fallback 到其他模型执行后台处理。

## 7. Application identity and data migration

Phase 5 delivered 2026-09-19. The authoritative production identity is `io.github.klioen.spirecode`; `com.bytedance.spirecode.dev` remains only as the legacy user-data migration source.

- 经 A1 批准后，Electron `appId`、macOS bundle ID、Windows identity 及 Linux desktop metadata 使用同一 production identity；移除 `.dev` 和未授权组织域名。
- 启动必须在创建 AppState 前执行 migration：
  1. 新目录已有数据时不覆盖。
  2. 仅旧目录存在时，先复制到同父目录 temporary target，校验 state/settings/log layout，再 atomic rename。
  3. 写入 migration marker，重复启动幂等。
  4. 失败时继续使用旧目录或明确停止，绝不同时部分写两个 catalog。
- `--user-data-dir` 显式覆盖跳过自动迁移，保证 tests/smoke 隔离。
- 不移动 `~/.pi/agent`、`~/.spirecode` managed worktrees 或 chat session 数据。

## 8. Dependency and supply-chain gates

- 修复当前 production audit 中的 moderate vulnerabilities；之后 high/critical 永久阻断，moderate 默认阻断，例外必须是有 owner、到期日和 advisory ID 的版本化 allowlist。
- Dependabot 或 Renovate 为 pnpm 和 GitHub Actions 提交更新；不存在需维护的 `pi-extensions` bundled Git dependency。
- GitHub Actions 固定到 immutable commit SHA，并由注释保留可读版本。
- release 生成 CycloneDX 或 SPDX SBOM；包含 npm production tree 和其他实际分发内容，不注入用户资源或已移除的 Pi package manifest。
- 构建使用 frozen lockfile；release workflow 记录 source commit、Node/pnpm/Electron 版本和 artifact SHA-256。
- 不在构建日志、git URL 或 artifact 中持久化 token。private dependency token 若不再需要则移除；若需要则采用最小权限、短期凭据。

## 9. CI and release pipeline

### Pull requests

三平台继续运行 `pnpm check`。另外运行：

- untrusted Git security tests；
- production dependency audit；
- license/notice validation；
- secret scan；
- production artifact reproducibility check。

packaging 相关路径变化时至少生成 unpacked native app 并执行 smoke，避免只在 merge 后发现 native failure。

### Tagged release

独立 `release.yml` 仅接受符合版本规则的 tag 或受保护 manual dispatch：

1. checkout exact tag，验证 clean source 与版本一致；
2. 三平台从 frozen lockfile 构建；
3. macOS signing/notarization/stapling 和 Windows signing；
4. 解包后验证 signature、license/notices、native `node-pty`、不存在已移除的 bundled Pi resources，以及 GUI bounded launch；
5. 生成 checksums、SBOM 和 build provenance/attestation；
6. 创建 draft GitHub Release；
7. required reviewer 核验后 publish。

缺少正式签名凭据时 job 必须失败或只产生明确标记的 unsigned development artifact，不得发布到正式 Release。

### Installer validation

- macOS 验证 DMG mount、Gatekeeper assessment、notarization/staple。
- Windows 在临时环境 silent install、launch、uninstall，并验证签名。
- Linux 验证 AppImage launch、deb install/remove（容器或 VM）及 desktop metadata。

## 10. Community and public documentation

公开前至少增加：

- `CONTRIBUTING.md`：环境、SDLC 三件套、分支/测试/PR 规则。
- `SECURITY.md`：支持版本、私密漏洞渠道、响应预期；不得要求先公开 issue。
- `CODE_OF_CONDUCT.md`。
- `SUPPORT.md`：bug、discussion、安全问题分流。
- issue forms、PR template、CODEOWNERS/maintainer ownership。
- `CHANGELOG.md` 或自动生成 release notes 的明确政策。

README 必须覆盖产品截图、支持矩阵、安装状态、源码构建、pi/provider setup、数据位置、用户安装 Pi resources 的信任边界、privacy/security links、troubleshooting、贡献和许可证。不能声称尚未完成的签名、auto-update、sandbox 或 bundled extension 能力。

## 11. Test stability and performance

- 对 `EditorPane` conflict reload 测试进行重复与随机顺序运行，排查全局 keyboard listener、mock queue、store/draft cache cleanup；修复生产 race 或 test isolation 根因，不添加 blind retry。
- `pnpm check` 连续多轮无 flaky failure后才能关闭该 finding。
- 将当前约 4.5 MiB Renderer 主 chunk 记录为性能基线；本计划至少纠正无效的 Monaco dynamic import 或明确接受 eager load。首屏/Chat/Terminal 可按 route/feature 拆分，但不作为法律和安全 release blocker。

## 12. Acceptance criteria

- owner decisions L1/L2/B1/A1/X1/R1 有版本化记录。
- 根 license 为批准的 OSI 文本，production artifact license scan 无 Unknown，最终 artifacts 含所有 required notices；`pi-extensions` 上游 license 不在检查范围，因为其代码不被分发。
- 恶意 Git fixtures 无 marker side effect；正常 Git/status/diff/worktree tests 全绿。
- diagnostics secret/path corpus 全部被排除。
- 无 `~/.pi/agent` 的 clean-profile smoke 能到达明确 setup UI；完成外部认证后可刷新并创建 Chat。
- 新用户 Memory 无 provider 偏置；已有用户配置迁移不变。
- 新旧 application data migration 在 empty/new-existing/old-only/failure/retry 场景均通过。
- `pnpm audit --prod --audit-level moderate` 成功，或仅存在未过期且批准的精确例外。
- PR 门禁及 tagged release workflow 在三平台通过；正式 artifact signature/notarization/checksum/SBOM/provenance 可验证。
- `pnpm check` 全绿，完整测试多轮稳定；仓库无已知 credential。
- README 和治理文档与实际功能、平台、签名和安全边界一致。

## 13. Concerns

- **法律决策不能由代码替代。** 在 L1/L2 未批准前，仓库不能被描述为开源，二进制不得公开再分发。
- **签名凭据是外部依赖。** 流水线代码可先完成，但正式 release 验收需要 release owner 提供凭据和受保护 environment。
- **Git 配置兼容性。** 禁用 fsmonitor/textconv 可能降低大型仓库性能或改变展示；安全优先，必要功能需以受控 opt-in 恢复。
- **首次权限迁移。** 不能把既有用户当作已同意新权限；同时也不应因 schema 升级突然禁用其已有明确配置。
- **App ID 迁移是数据安全高风险步骤。** 必须先备份、校验、幂等，且不能和大规模 state schema 重写混在一个 commit。
- **Filesystem race 无完美跨平台单一 API。** 应以 fail-closed 和可测试的风险下降为目标，并诚实记录剩余边界。
