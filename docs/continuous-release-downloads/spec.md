# Spec: Continuous nightly GitHub Release

## Requirements

1. `main` push 的现有三平台 verify matrix 全部成功后，创建或替换固定标签 `nightly` 对应的 GitHub prerelease。
2. prerelease 包含 macOS `.dmg`、Windows `.exe`、Linux `.AppImage` 与 `.deb`。
3. 下载页地址固定为仓库的 `/releases/tag/nightly`。
4. release 说明包含来源 commit SHA，并声明产物未经正式签名或公证。
5. pull request 只运行验证，不发布 release。
6. 现有 Actions artifacts 保留，用于跨 job 传递和故障排查。
7. 正式 tag release workflow 不受影响。

## Design

在 `.github/workflows/ci.yml` 添加 `publish-nightly` job：

- `needs: verify` 确保 matrix 全部成功。
- job 条件仅允许 main push。
- 显式授予 `contents: write`。
- 使用已固定 SHA 的 `actions/download-artifact` 下载三个 artifact，并合并到 `release/`。
- 使用 GitHub CLI 删除旧 `nightly` release/tag（若存在），再从当前 `GITHUB_SHA` 创建新的 `nightly` prerelease 并上传安装包。
- 使用 `--target "$GITHUB_SHA"`，防止 release 指向错误 commit。

## Concerns

- 删除再创建会产生一个短暂的下载窗口；相比增量覆盖，这能可靠移除已不再生成的旧文件，并确保 tag 指向当前 commit。
- GitHub Releases 在部分网络环境仍可能受限，但通常比 Actions artifact CDN 更适合直接分发。
- 这些仍是开发包；ad-hoc 签名不会让 macOS Gatekeeper 信任它们。

## Acceptance

- main workflow 三平台成功且 `publish-nightly` 成功。
- `gh release view nightly` 显示 prerelease，target 为最新 main commit。
- release 中存在四种平台产物。
