# Spec: SpireCode MVP Release Readiness P0
Status: accepted。 Implements: `docs/release-readiness-p0/intent.md`。

## 1. Scope

### Included

- 修复 ESLint 在仓库内存在 `.delta/worktrees` 等嵌套 checkout 时的 TSConfig root 歧义，并排除生成/托管目录。
- 修复当前 Git parser 回归测试，使测试按稳定 path 顺序和完整 DTO 合约断言。
- managed worktree 删除后保留其 local branch，并同步确认文案和测试。
- 增加 Renderer 与 Main 之间的窄化 dirty-state 协议，用于窗口关闭和应用退出保护。
- 启动 hydration 恢复持久化的 active worktree。
- 移除未实现的 Command Center/Quick Open affordance。
- 更新 README 和对应现有 Worktree/文件编辑文档中的过时描述。

### Excluded

- Developer ID、notarization、自动更新、CI 发布流水线。
- crash 后草稿恢复、autosave、Save As、三方 merge UI。
- Agent 登录/认证 UI。
- Command Palette / Quick Open 的真实实现。
- Git stage、commit、discard 和 Agent change undo。

## 2. Quality gate

- ESLint 配置必须显式使用仓库根作为 `tsconfigRootDir`。
- `.delta` 及其他本地托管 worktree/build 目录不得参与 root lint。
- Git parser 测试不得依赖与实现不一致的数组顺序；如果 parser 的正式合约是 path 排序，则测试必须按该顺序断言。
- `pnpm check` 必须全部退出 0。

## 3. Worktree deletion

- `worktree_delete` 对 managed worktree 执行 `git worktree remove` 后直接移除 catalog 记录。
- 不执行 `git branch -D/-d`。
- dirty worktree 和 running terminal 的现有非 force 拒绝行为保持不变。
- force delete 的 UI 必须只声明删除 worktree 文件和停止相关运行资源，不声称删除 branch。
- 测试必须证明删除后 `refs/heads/<branch>` 仍存在。

## 4. Dirty close protocol

### Renderer state

- Editor store 提供纯派生查询：是否存在 dirty file tabs，以及可用于用户提示的 dirty file 数量。
- 文件正文继续由现有内存 draft cache 所有，不通过 IPC 发送。

### Preload/Main protocol

- 新增一个显式 allowlisted、无任意 payload 的 Renderer-to-Main dirty-state 通知，或等价的窄化关闭握手。
- Main 在窗口 `close` 和应用 `before-quit` 时，如果 Renderer 报告存在 dirty 文件，则阻止退出并要求用户确认。
- 用户选择取消后窗口和应用必须保持运行。
- 用户确认 discard 后，本次关闭可继续，不得形成无限 close loop。
- 应用正常关闭仍执行 AppState cleanup。

### UX

- 本批可以使用同步确认对话框实现最小安全门槛，文案明确未保存文件数量及不可恢复性。
- 本批不要求 Save All；用户可以取消退出后自行保存。

## 5. Startup restoration

- `hydrateCatalog` 优先采用合法的 `catalog.activeWorktreeId`。
- active ID 缺失或不再存在时，回退至首个 project 的 main worktree，再回退至首个 worktree。
- 零项目时保持 `null`。
- 单项目、多项目、无效 active ID 均需测试。

## 6. Honest UI and documentation

- 在功能实现前移除无 `onClick`/keydown 行为的 Command Center 和 `⌘P Quick open` 提示。
- README 必须说明 Monaco 支持显式保存编辑，而非只读。
- Worktree 文档必须统一“删除 worktree、保留 local branch”的行为。
- 本批文档不得宣称已具备 crash recovery、公开签名或认证向导。

## 7. Security

- 不放宽 Electron 安全配置。
- 新增 IPC/bridge API 必须静态 allowlist，并验证 sender。
- Renderer 只发送 boolean/count 等视图状态，不发送文件正文、路径或草稿。
- 退出保护不允许 Renderer 触发任意原生对话框参数。

## 8. Acceptance

- 存在 `.delta/worktrees/*` 时 `pnpm lint` 通过。
- `pnpm test` 全绿。
- 删除 clean/dirty(force) managed worktree 后 local branch 仍存在。
- dirty 文件存在时关闭窗口会提示；Cancel 保持窗口；Discard 允许退出。
- 没有 dirty 文件时关闭不增加提示。
- 重启 hydration 恢复合法 active worktree。
- UI 不再展示不可用的 `⌘K`/`⌘P`。
- `pnpm check` 全绿。

## 9. Concerns

### Window close race

macOS 的窗口关闭、`window-all-closed` 和 `before-quit` 会相互触发。实现必须使用明确的 closing/discard latch，确保既不会跳过 cleanup，也不会递归阻止退出。

### Renderer crash

如果 Renderer 已崩溃，Main 无法可靠查询内存草稿。本批只保护正常窗口/应用退出；crash recovery 是独立后续变更。

### Existing users

保留 branch 会改变当前实现行为但恢复批准的产品语义。删除 worktree 后同名 branch 仍存在，后续再次创建时必须沿用现有 branch collision 错误处理。
