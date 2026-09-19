# Spec: 精简 General Settings 并独立展示 Feedback
Status: accepted。 Implements: `docs/settings-general-feedback/intent.md`。

## 1. General 页面

General 保留 Theme 与 Language 设置。Diagnostics 设置行及其 Copy diagnostics、Reveal logs 操作全部移除。

Feedback 使用独立 `setting-row`：左侧展示 Feedback 标题和用途说明，右侧展示 Send feedback 按钮。点击后继续调用现有 `feedback_open` 类型化命令。

## 2. 状态与错误

删除只服务于 Diagnostics 复制动作的成功状态。Feedback 调用失败时继续复用 General 页现有错误区域展示错误。

## 3. 非目标

- 不删除 Electron Main 的 DiagnosticsService 或日志文件。
- 不改动启动、崩溃及全局错误日志记录。
- 不改变反馈地址或反馈打开机制。

## 4. 验收

- General 页面不显示 Diagnostics、Copy diagnostics、Reveal logs。
- Feedback 标题、说明和 Send feedback 按钮显示为独立设置行。
- 点击 Send feedback 仍调用现有命令。
- 中英文界面均无遗留 Diagnostics 文案。
- `pnpm check` 通过。
