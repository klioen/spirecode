# Spec: 将阻塞型 Tauri command 移出 UI 主线程
Status: accepted。 Implements: `docs/fix-open-project-main-thread-block/intent.md`。

## Requirements

- `project_open_dialog` 必须是 async Tauri command；目录选择使用插件支持的异步 command 上下文。
- Git root 解析、持久化和 watcher 注册必须在 blocking pool 执行。
- `project_open_path`、文件读取、Git status/diff、PTY 创建等潜在阻塞操作不得作为同步 Tauri command 在 UI 线程执行。
- 保持现有前端 command 名称和返回 DTO 不变。
- 后台任务 panic/join failure 映射为结构化错误。

## Design

async command 通过 `AppHandle` 在 `tauri::async_runtime::spawn_blocking` closure 内重新取得 managed `AppState`，避免把借用生命周期传入 `'static` task。系统 dialog 在 async command 中调用 blocking API，符合插件文档给出的用法；选择完成后项目初始化进入 blocking pool。

## Proof

增加源码边界回归测试，固定所有已知阻塞 command 必须声明为 async 并通过 blocking helper 调度。运行 Rust/前端完整测试、bundle smoke，并覆盖安装 `/Applications/Pi App.app`。
