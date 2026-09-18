# Plan: CI 质量与打包流水线（from `docs/ci-release-pipeline/spec.md` 2026-09-18）

## Files that change

- `docs/ci-release-pipeline/{intent,spec,plan}.md`
- `.github/workflows/ci.yml`（新增）
- `README.md`：CI 说明一行。

## Order of work

1. 编写 workflow（checkout/setup/install/check/audit/bundle/upload）。
2. 本地校验 YAML 语法（node js-yaml 不可用时目测 + actionlint 若可用）。
3. 提交；首次真实验证在 GitHub Actions 上运行。

## Risks

- 私有 `pi-extensions` 依赖在无 PAT 时 install 失败：通过可选 `CI_GITHUB_TOKEN` secret 与 `insteadOf` 注入缓解；secret 未配置时该步骤跳过。
- runner GUI 启动 Electron smoke：macos runner 支持；若失败再降级为仅 `smoke:app` 的 headless 部分。

## Proof

- GitHub Actions run 绿色（首次 push 后人工确认）；
- `pnpm check` 本地保持绿色。
