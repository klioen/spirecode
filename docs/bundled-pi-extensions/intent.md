# Intent: SpireCode 默认携带 Pi extensions
Author: user。 Status: accepted。

## Problem

SpireCode 的 pi Agent 当前只使用用户和项目现有的 Pi resources。默认能力依赖用户事先在 `~/.pi/agent/settings.json` 安装 `~/Code/pi-extensions`，新机器、发布包或源码目录被移动后无法保证 web access、subagents、todo、planning、goal、failover、memory 和 SDLC skills 可用。

## Proposed outcome

SpireCode 发布包固定并携带一组默认 Pi packages，开发态与正式版使用相同的 bundled resource 行为。SpireCode 不读取用户默认的 `~/.pi/agent/settings.json`，而是读取独立的 `~/.spirecode/settings.json` 作为额外用户配置。bundled resources 始终作为稳定基础层；额外配置与 bundled 发生同 package 冲突时忽略重复项，发生实际 tool、command 或 provider 注册冲突时终止 Agent session 初始化，不能静默覆盖或重复运行。

默认资源：

- `pi-web-access`
- `pi-subagents`
- `pi-todo`
- `pi-plan`
- `pi-goal`
- `pi-failover`
- `pi-memory`
- `pi-sdlc` skills

不默认携带或启用：`pi-web`、`pi-lark`、`pi-env`。

## Affected users and systems

- SpireCode Chat 用户。
- Electron Main 中的 pi Agent resource loading。
- macOS `.app`/`.dmg` 打包、签名和 smoke verification。
- `pi-memory` worker 及其用户目录持久化数据。

## Constraints

- 不复制 extension 源码到 SpireCode 业务源码中；依赖必须固定到可复现版本或 commit。
- Renderer 不接触 extension 路径或 Node API。
- bundled 资源只读；`pi-memory` 数据继续写入用户 Pi 目录。
- 开发态和正式版使用同一份 SpireCode settings 与 bundled resource 规则。
- 不读取 `~/.pi/agent/settings.json`，不自动加载 `~/.pi/agent/extensions/` 或项目 `.pi/extensions/`。
- `~/.spirecode/settings.json` 是唯一的 SpireCode 额外 package/extension 配置入口。
- bundled resources 优先；同 package 用户资源被忽略，实际注册名冲突时终止 Agent session 初始化并报告稳定错误。
- 模型认证、自定义模型和现有 session 仍复用 `~/.pi/agent`，本次不迁移这些数据。
- 保持 pi SDK 版本精确锁定，并通过 lockfile 固化依赖。

## Open questions

无。默认 package 范围、开发态行为、发布态 fallback 和冲突优先级均已确认。
