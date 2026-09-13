# Plan: 修复 Open Project 主线程阻塞（from `docs/fix-open-project-main-thread-block/spec.md` 2026-09-13）

## Files that change

- `src-tauri/src/commands.rs`：async command 和统一 blocking dispatcher。
- `src-tauri/src/error.rs`：后台任务 join error 映射（如需要）。
- `src-tauri/src/commands_test.rs` 或模块测试：阻塞 command 边界回归。

## Order of work

1. 添加能识别同步阻塞 command 的回归测试并确认失败。
2. 将项目打开、文件、Git、PTY 创建移动到 blocking pool。
3. 运行 Rust 测试和完整 `pnpm check`。
4. 重新 bundle、安装并启动验证。

## Risks

最危险的是将 `State<'_>` 借用移入 `'static` blocking task；通过移动 `AppHandle` 并在 closure 内重新取得 state 解决。不能仅把函数标成 async 后仍直接长时间阻塞 async worker。

## Proof

`cargo test --manifest-path src-tauri/Cargo.toml`、`pnpm check`、`pnpm bundle`。
