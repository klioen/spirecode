# Intent: 修复 Open Project 卡死
Author: keliangliang。 Status: accepted。

## Problem

用户在系统目录选择器中选中项目后，应用窗口卡死。`project_open_dialog` 是同步 Tauri command，却调用明确禁止在主线程使用的 `blocking_pick_folder`，随后还同步执行 Git root 解析、状态持久化、递归 watcher 注册；项目激活后的文件读取和 Git 请求也使用同步 command。

## Proposed outcome

系统目录选择器和所有可能阻塞的本地 I/O 不占用 Tauri UI 主线程。打开项目期间界面保持响应，成功后正常加载文件树。

## Affected users and systems

所有使用 Open Project 的用户；Tauri command 边界、Projects、Files、Git 和 Terminal 创建路径。

## Constraints

保留现有窄 command 接口和路径安全；不把阻塞工作转移到 React；错误继续通过结构化 `CommandError` 返回。

## Open questions

无。
