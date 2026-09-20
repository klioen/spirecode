# Intent: CI 质量与打包流水线

> [!NOTE]
> 本文保留首次 CI 交付时的历史约束。私有 `pi-extensions` 安装方案已由 [`docs/remove-pi-extensions-dependency/`](../remove-pi-extensions-dependency/intent.md) 取代；当前 CI 不需要该仓库或相应 PAT。

Author: product owner。 Status: accepted。

## Problem

SpireCode 目前没有 CI。`pnpm check` 只在开发机上运行，`.delta/worktrees` 曾让 ESLint 全量失败却没有被任何门禁拦截；`pnpm bundle` 不包含 lint/test，任意机器都能产出未验证的 release 产物，无法证明产物对应的 commit 与检查结果。

## Proposed outcome

建立 GitHub Actions workflow：

1. `push`/`pull_request` 触发质量门禁：frozen install → `pnpm check` → 生产依赖 audit。
2. `main` 分支额外执行完整 `pnpm bundle`（构建、ad-hoc 签名、DMG、app/dmg smoke），并上传产物 artifact。
3. 任一步骤失败即 workflow 失败；audit 因已知 Monaco/dompurify 告警暂不阻断，输出供跟踪。
4. 私有 `pi-extensions` 依赖通过可选 PAT secret 拉取；无 secret 时按普通公网 git 解析。

## Affected users and systems

- 维护者与发布流程：每次 push 获得 commit 级别的检查和产物可追溯性；
- `.github/workflows/ci.yml`（新增）。

## Constraints

- 不在本批实现 Developer ID 签名、公证、发布上传；CI 产物仍是 ad-hoc 本地验证构建。
- Runner 使用 `macos-14`（Apple Silicon）以满足 arm64 构建与 smoke。
- Node/pnpm 版本与 `package.json` `packageManager` 对齐。

## Open questions

- `CI_GITHUB_TOKEN` PAT 的授予由负责人在 repo secrets 中配置；
- LICENSE 与第三方声明选择（MIT/Apache-2.0/私有）需要产品负责人决策后另行交付。
