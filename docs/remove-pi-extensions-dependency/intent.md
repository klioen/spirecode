# Intent: Remove the pi-extensions repository dependency
Author: product owner. Status: accepted.

## Problem

SpireCode 当前仍通过 `package.json` 的 Git devDependency 获取 `github:klioen/pi-extensions`，开发和打包会把其中七个 package staging 到 `.build/pi-extensions` 并随应用分发。这与“不依赖 github:klioen/pi-extensions 仓库”的产品要求冲突，也引入网络安装、许可证、构建、SBOM 和运行时完整性耦合。

## Proposed outcome

1. 源码、lockfile、安装、开发、测试、构建、打包和运行时均不引用、下载或要求 `github:klioen/pi-extensions`。
2. SpireCode 继续直接依赖 `@earendil-works/pi-coding-agent`，保留 SDK 自带的 Agent session 和基础 coding tools。
3. Web、subagents、todo、plan、goal、memory、SDLC 等非 SDK 内置能力不再随 SpireCode 分发；用户可通过标准 pi settings 显式安装和启用。
4. SpireCode 继续支持用户在 `~/.pi/agent/settings.json` 和 `~/.spirecode/settings.json` 中声明的 packages/extensions，并由 pi SDK 的 package/resource 机制解析。
5. Extensions UI 只展示实际配置/解析到的用户资源，不显示虚假的 built-in catalog。
6. Memory UI 在未安装 `pi-memory` 时显示明确的可选扩展提示；已安装时继续提供配置和文档读取能力。
7. 删除因 bundled repository 产生的许可证阻断、资源 staging、manifest 校验和 artifact smoke 逻辑。

## Affected users and systems

- 新用户默认只有 pi SDK 基础 Agent 能力，不再自动获得七个扩展 package。
- 已依赖 bundled todo/web/subagents/goal/plan/memory/SDLC 的现有用户，需要在标准 pi 配置中自行安装相应 package。
- Chat、Settings、Memory、构建脚本、Electron resources、CI、SBOM 和公开文档。

## Constraints

- 不把 `pi-extensions` 源码复制或 vendor 到 SpireCode；否则仍然形成代码和授权依赖。
- 不宣称七项能力由 pi SDK 内置；SDK 0.84.4 只提供扩展机制和基础 coding tools。
- 不删除 Chat 对已有 `pi-todo-state` transcript 的兼容渲染。
- 不删除独立的 Memory 文档读取服务；只有扩展执行能力变为用户可选。
- 不扩大 Renderer 权限，不读取或返回用户 credentials。
- 已有 Settings v6 状态需要安全迁移：忽略旧 bundled IDs，不因不存在的内置扩展阻止启动。

## Open questions

None. 用户已明确要求不依赖 `github:klioen/pi-extensions` 仓库。
