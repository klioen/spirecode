# Task 自动 Git 交付 Plan

## Implementation

1. 扩展 report DTO/validation，使 draft 为 boolean，并强化 provider URL 校验；保留历史 Draft 数据。
2. 增加 Main-owned delivery service：执行起点、existing 独立分支、target、stage/commit/push、GitHub/GitLab query/create/verify。
3. 在 Task saga 的 workspace bind 后、prompt 前持久化 `git_start`；在 report+idle 后、`needs_review` 前执行 `git_delivery`。
4. 用 run steps 保存 intent/done 和 identity；恢复时精确探测并 adopt。交付 Retry 恢复同一 Run。
5. AppState 只注入 canonical worktree root；同步 catalog branch，不向 Renderer 暴露路径或命令。
6. 更新 Task detail delivery artifact、dirty 文案、中英文 copy 和历史兼容。
7. 更新 Task 模块文档，删除 Draft-only 与“push/PR 非必要”约束。

## Verification

- Focused Main tests：origin 解析、start/dirty/target、commit/no-op、GitHub/GitLab Ready、Draft/closed/missing、失败映射、report replacement、retry/recovery。
- Focused Renderer tests：Ready、历史 Draft、历史 Run、无链接、dirty 明示、外链属性与确认。
- 兼容测试：report validation、repository/database 历史 JSON、IPC/tool boolean。
- 运行 `pnpm check`，记录实际命令和结果。

## Safety review

最终 diff 静态确认不存在 force push、approve、merge、release；确认 provider token 不在 argv、SQLite、event、错误或 Renderer DTO 中。
