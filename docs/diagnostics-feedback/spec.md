# Spec: 本地日志、诊断与反馈
Status: accepted。 Implements: `docs/diagnostics-feedback/intent.md`。

## Main commands

新增 allowlisted commands：

- `diagnostics_copy`：返回脱敏文本；Renderer 可复制；
- `diagnostics_reveal_logs`：Main 用 `shell.openPath` 打开日志目录；
- `feedback_open`：Main 只打开固定 HTTPS feedback URL。

## Logging

- userData/logs/spirecode.log；单文件上限 2 MiB，超限轮转为 `.1`；
- 启动、主进程错误、cleanup failure 写入日志；
- logger 对字符串中的 API key/token/secret、环境值不记录；
- logger 失败静默，不阻断业务。

## Diagnostics

包含 app version、Electron version、Node version、platform、arch、process type、userData basename、最近日志尾部（最多 64 KiB）。不包含绝对项目路径、文件正文、prompt、tool args/results、terminal input 或 credential。

## Acceptance

- IPC allowlist 和参数校验测试；
- diagnostics 文本不包含敏感字段；
- log rotation 测试；
- Settings General 显示 Copy diagnostics、Reveal logs、Send feedback；
- `pnpm check` 全绿。
