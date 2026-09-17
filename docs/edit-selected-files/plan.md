# Plan: 允许编辑选中的文件（from `docs/edit-selected-files/spec.md` 2026-09-17）

## Files that change

- `docs/edit-selected-files/{intent,spec,plan}.md` — 需求、设计和实施审计链。
- `electron/contracts.ts` — allowlist 新增 `fs_write_file`。
- `electron/ipc.ts` — 校验保存参数并委派 filesystem service。
- `electron/ipc.test.ts` — 固定正文大小、必填字段和额外字段拒绝规则。
- `electron/domains/filesystem/service.ts` — 文件版本、冲突检查和原子保存。
- `electron/domains/filesystem/filesystem.test.ts` — 保存、冲突、体积与安全回归测试。
- `src/bindings/generated.ts` — 增加 `FILE_CONFLICT` 并固定 FileContent version 类型。
- `src/bindings/index.ts` — 暴露窄化 `fsWriteFile` adapter。
- `src/features/editor/editorStore.ts` — 仅保存 tab dirty metadata 与更新动作。
- `src/features/editor/editorStore.test.ts` — dirty metadata 状态测试。
- `src/features/editor/EditorPane.tsx` — 可编辑 buffer、保存、错误和 dirty-close 交互；diff 保持只读。
- `src/features/editor/EditorPane.test.tsx` — 编辑、`⌘S`、保存失败/冲突和关闭确认测试。

## Order of work

1. 先补 filesystem 与 IPC 的失败测试，覆盖正常写入、expectedVersion 冲突、超限正文、越界路径和参数 allowlist。
2. 增加 `fs_write_file` 契约和 Main filesystem 原子写入实现，使后端测试通过。
3. 补 editor store 和 EditorPane 的失败测试，覆盖可编辑 Monaco、dirty 标记、`⌘S`、失败保留 buffer、diff 只读和关闭确认。
4. 实现 Renderer adapter、局部 dirty buffer、保存状态与标签提示。
5. 检查 watcher invalidation 与 cache 的交互，确保 dirty buffer 不被后台刷新覆盖。
6. 运行定向测试，再运行完整 `pnpm check`，审查 diff 与 git status。

## Risks

- **最大风险：数据丢失。** watcher 重读、旧异步响应或保存冲突都可能覆盖用户 buffer。通过局部 buffer、generation gate 和 expectedVersion 条件写入共同保护。
- **危险步骤：原子替换。** rename 可能改变 mode 或被 symlink/path race 利用；实现需复用 canonical path guard、同目录临时文件和 mode 保留。
- **IPC 负载。** 不能沿用 64 KiB 通用文本限制，也不能无限放开；为文件正文设置与读取一致的 5 MiB byte 上限。
- **放弃的方案：只把 `readOnly` 改为 false。** 该方案没有保存、安全边界、dirty 状态或冲突保护，会制造可输入但不可可靠持久化的假编辑器。
- **放弃的方案：autosave。** 首版显式保存更容易避免 watcher 循环与无提示覆盖，autosave 作为后续独立需求。

## Proof

```bash
pnpm vitest run electron/domains/filesystem/filesystem.test.ts electron/ipc.test.ts src/features/editor/editorStore.test.ts src/features/editor/EditorPane.test.tsx
pnpm typecheck
pnpm check
```

人工 smoke：打开文本文件，修改并按 `⌘S`，确认磁盘更新；制造外部修改后再次保存，确认提示冲突且两侧内容均未被静默覆盖；确认 diff 仍只读。

## Approval

待用户确认本计划后开始产品代码修改。
