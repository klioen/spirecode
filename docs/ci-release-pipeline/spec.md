# Spec: CI 质量与打包流水线
Status: accepted。 Implements: `docs/ci-release-pipeline/intent.md`。

## 1. Workflow 结构

`.github/workflows/ci.yml`，单一 job `verify`，运行于 `macos-14`：

```text
checkout
setup Node 24 + pnpm 10.29.2（从 packageManager 读取）
（可选）git url.insteadOf 注入 CI_GITHUB_TOKEN
pnpm install --frozen-lockfile
pnpm check
pnpm audit --prod --audit-level moderate（continue-on-error，结果可见）
main 分支：pnpm bundle → upload-artifact release/*
```

## 2. 行为要求

- `pnpm check` 失败必须使 workflow 失败。
- `pnpm bundle` 复用现有 `scripts/package-electron.mjs` 全链路，包括 `smoke-app.sh` 与 `smoke-dmg.sh`。
- artifact 上传 `release/` 下 `.app` 与 `.dmg`。
- workflow 不携带任何凭据进环境日志；token 只通过 git url 配置使用。

## 3. 验收

- 在 GitHub 上 push 后 Actions 页面出现 `verify` run；
- PR 上门禁失败会阻止合并（配合分支保护，配置由负责人执行）；
- main run 的 artifact 包含可启动的 DMG。

## 4. Concerns

- GitHub-hosted macOS runner 配额消耗较大；如频率过高，可后续将 bundle 限制为 tag/manual trigger。
- audit 已知 2 moderate（monaco → dompurify），本批不修复、不阻断，修复后改为阻断。
