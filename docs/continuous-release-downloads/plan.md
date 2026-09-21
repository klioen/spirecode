# Plan: Continuous nightly GitHub Release（from `docs/continuous-release-downloads/spec.md` 2026-09-20）

## Files that change

- `docs/continuous-release-downloads/{intent,spec,plan}.md`：记录需求、设计与实施证明。
- `.github/workflows/ci.yml`：新增 main 成功后的 nightly prerelease 发布 job。
- `README.md`：增加 nightly 下载入口和开发包说明。

## Order of work

1. 在现有 verify matrix 后增加 `publish-nightly` job，仅允许 main push 执行。
2. 下载并合并三个 matrix artifacts。
3. 使用仓库内置 `gh` CLI 删除旧 `nightly` release/tag，再从当前 SHA 创建 prerelease 并上传四类安装包。
4. README 增加固定下载入口。
5. 真实 CI 暴露编辑后立即 Ctrl-S 的生产竞态；在编辑回调中同步更新 `saveState` 快照，保留原失败测试作为回归证明。
6. 校验 workflow YAML、格式和项目检查；push 后检查真实 Actions run 与 release assets。

## Risks

- 最危险步骤是更新固定 release/tag；条件或权限错误可能导致 PR workflow 写入 Releases。通过 job-level `if` 和最小 `contents: write` 权限限制。
- 删除旧 release 后创建失败会暂时没有 nightly 下载；shell 采用 fail-fast，真实 CI 验证必须确认创建成功。
- Linux CI 暴露了编辑状态与快捷键保存之间的 render 时序竞态；修复生产快照而非放宽测试等待。
- 不采用每次创建唯一 release，避免 Releases 页面堆积；不替换正式 release workflow，避免混淆正式版本和开发构建。

## Proof

- workflow YAML 能被解析。
- `pnpm check` 通过。
- main Actions run 中 verify 三平台和 `publish-nightly` 全部成功。
- `gh release view nightly --json isPrerelease,targetCommitish,url` 与 assets 列表符合 spec。
