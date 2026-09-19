# Plan: Chat 上下文三级面包屑（from docs/chat-context-breadcrumb/spec.md 2026-09-18）

## Files that change

- `docs/chat-context-breadcrumb/intent.md`：记录已确认的用户意图和边界。
- `docs/chat-context-breadcrumb/spec.md`：定义三级顺序、语义和验收标准。
- `docs/chat-context-breadcrumb/plan.md`：记录实施顺序、风险和证明。
- `src/features/workbench/Workbench.test.tsx`：增加面包屑内容与顺序回归测试。
- `src/features/workbench/Workbench.tsx`：将当前混合展示改为 Project / Worktree / Branch 三级结构。
- `src/styles/index.css`：增加分隔符及三级文本的紧凑样式。

## Order of work

1. 增加 Workbench 回归测试，要求顶栏存在可访问的上下文面包屑，并按 Project、Worktree、Branch 顺序输出。
2. 运行定向测试，确认旧实现不满足新的结构和语义。
3. 修改 `Workbench`，使用独立节点渲染三级内容和隐藏于辅助技术的分隔符。
4. 调整 CSS，保留 Branch 的等宽视觉强调并使容器在窄宽度下安全收缩。
5. 运行 Workbench 定向测试，再运行 `pnpm check`。

## Risks

- 可能破坏顶栏布局，尤其是较长项目名、Worktree 名和 Branch 名；最危险的是三个层级挤压中央命令框。通过最小样式调整、截断规则和现有响应布局检查降低风险。
- 不采用把面包屑移入 `ChatView` 的方案，因为当前顶栏是整个活动 Worktree 的统一上下文入口，移动后文件、Diff、Terminal 会失去上下文且造成重复布局。
- 不新增后端查询，因为 catalog 已包含全部所需字段。

## Proof

```bash
pnpm exec vitest run src/features/workbench/Workbench.test.tsx
pnpm check
```

验收结果：活动 Worktree 顶栏可访问地显示 `Project > Worktree > Branch`，无活动项目仍显示原有空状态，全部检查退出码为 0。
