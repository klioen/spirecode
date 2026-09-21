# Intent: 加速 main 构建产物下载
Author: user. Status: accepted.

## Problem
GitHub Actions artifact 在当前网络环境下下载速度很慢，影响 Windows、Linux 和 macOS 开发包的获取。

## Proposed outcome
每次 main 分支三平台 CI 全部成功后，将安装包自动发布到固定的 GitHub `nightly` 预发布版本，使用 GitHub Releases CDN，并保持稳定下载入口。

## Affected users and systems
- 从 main CI 获取开发安装包的用户
- `.github/workflows/ci.yml`
- GitHub Releases 与仓库 release/tag 写权限

## Constraints
- 正式 `v*.*.*` release 流程保持不变。
- `nightly` 必须明确标记为非正式预发布。
- 仅 main push 可发布；pull request 不得写入 Releases。
- 三个平台均成功后才更新 `nightly`。
- 不引入新的第三方 Action。

## Open questions
None.
