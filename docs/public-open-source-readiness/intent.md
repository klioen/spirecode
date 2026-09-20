# Intent: SpireCode public open-source readiness
Author: product owner. Status: accepted.

## Problem

SpireCode 已具备 Projects、managed Worktrees、Files、Git Changes、Terminal、多会话 Agent Chat、三平台 CI 与本地产物打包能力，但当时仓库和发行链路仍不能被称为正式开源发布：根许可证、Git 安全、应用标识、签名、依赖审计、首次使用、扩展信任、社区治理和正式 release 流程均存在缺口。早期方案还把 bundled `pi-extensions` 的授权作为 blocker；该依赖和分发行为现已移除，因此该上游仓库的许可证不再是 SpireCode 当前 release blocker。

这些问题同时影响法律可分发性、不可信仓库安全、新用户可用性、隐私承诺、供应链可信度和长期外部协作。零散修补会留下互相矛盾的文档和发布状态，因此需要一个统一目标、分阶段交付且每阶段可独立验收的大计划。

## Proposed outcome

完成后，SpireCode 应达到以下状态：

1. 仓库使用由权利人批准的 OSI 开源许可证，项目和所有实际分发的 runtime 资源具有可验证的再分发依据，源码和安装包都携带所需 LICENSE/NOTICE；用户自行安装的 Pi resources 不由 SpireCode 分发。
2. 打开或浏览不可信 Git 仓库不会因仓库级 Git 配置静默执行外部程序；文件访问和 diagnostics 对公开 threat model 的承诺与实现一致。
3. 新用户不依赖既有 `~/.pi/agent` 知识即可理解并完成 pi/provider 认证，Memory 不绑定特定 provider，网络、子 Agent 和后台 Memory 等高权限扩展具有清晰的首次信任选择。
4. 使用正式、项目控制的 application identifier，并为既有用户提供可回滚的数据迁移。
5. CI 在 macOS、Windows、Linux 上执行质量、安全、许可证和供应链门禁；tag 驱动的发布生成 immutable artifacts、checksums、SBOM 和 provenance。
6. 获得外部签名凭据后，macOS 产物完成 Developer ID signing、notarization、stapling，Windows 产物完成 Authenticode；无凭据时流水线必须明确拒绝将产物标记为正式 release。
7. README、SECURITY、CONTRIBUTING、Code of Conduct、支持和发布政策使外部用户及贡献者无需内部背景即可安装、配置、报告漏洞和参与开发。
8. `pnpm check`、生产依赖审计、恶意仓库回归测试、许可证校验、三平台 bundle smoke 和 release 验证全部通过，且已知 EditorPane 测试不再存在可复现的跨测试时序不稳定。

## Affected users and systems

- 下载源码或正式安装包的 macOS、Windows、Linux 用户。
- 首次使用 pi Agent、尚无 provider 认证配置的用户。
- 打开第三方或不可信 Git 仓库的用户。
- 外部贡献者、维护者、安全研究人员和 release operator。
- Electron Main：Git、Filesystem、Diagnostics、Settings、Chat、持久化和应用目录。
- Renderer：首次启动、Agent/Extensions/Memory 设置和错误恢复 UX。
- 构建与发布：pnpm lockfile、实际分发的 runtime resources、electron-builder、GitHub Actions、签名和 release assets。
- 法律与项目治理：许可证、第三方 notice、品牌资产、漏洞披露和贡献政策。

## Constraints

- Renderer 继续保持 `sandbox: true`、`contextIsolation: true`、`nodeIntegration: false`，不获得通用文件系统、shell、Electron IPC 或 pi SDK 权限。
- Git 继续使用 executable + argument arrays，不使用 shell command string；防御不可信仓库配置不能破坏正常 status/diff/worktree 行为。
- Agent 与明确启用的扩展仍以当前 OS 用户权限运行；本计划不把 worktree 宣称为 OS 安全沙箱。
- 不把 API key、token 或私钥写入 SpireCode state、日志、仓库、CI artifact 或 diagnostics；优先复用 pi 的认证存储和 provider 能力。
- 不伪造或绕过 Apple/Windows 签名、notarization、商标、版权或第三方许可证审批；缺失外部凭据/授权时必须 fail closed。
- application identifier 迁移必须保留现有用户项目目录、设置和会话引用，并且重复启动幂等。
- production dependency、实际分发资源和 GitHub Actions 必须固定到可审计版本/commit；生产 release 可从 tag 和 commit 重建。
- 同一大计划允许分阶段 PR，但每个阶段必须保持主分支可构建、文档诚实且不提前宣称后续能力已完成。

## Approved owner decisions

Approved 2026-09-19:

1. **许可证：** Apache-2.0；copyright holder 使用实际项目权利主体。
2. **版权与品牌：** 增加 `TRADEMARKS.md`，开源许可证不授予 SpireCode 名称和品牌资产的商标权。
3. **Application identifier：** `io.github.klioen.spirecode`。
4. **发行渠道：** 首批正式渠道为 GitHub Releases；Homebrew、winget 和 Linux package repositories 不在本轮范围。
5. **签名主体与凭据：** release workflow 使用 GitHub protected environment，缺少 Apple/Windows 正式凭据时 fail closed；凭据由 release owner 提供。
6. **Pi resources：** SpireCode 不提供 bundled extension 默认集。用户通过标准 Pi settings 自行安装和声明 packages、extensions、skills、prompts 与 themes，并承担相应信任决策。
7. **更新策略：** 自动更新器不纳入首轮正式开源。
