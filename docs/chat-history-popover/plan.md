# Plan: Chat history 视觉与关闭交互优化

From `docs/chat-history-popover/spec.md`。Status: approved，用户已确认按此方案实施。

## Files that change

- `docs/chat-history-popover/{intent,spec,plan}.md`：需求、方案、执行及验证记录。
- `src/features/chat/ChatHistory.tsx`：搜索、时间分组、当前会话指示、标题栏与关闭按钮、完整列表状态。
- `src/features/chat/ChatHistory.test.tsx`：排序分组、过滤、当前项、无效日期、空/错误/加载状态、选择与关闭回调测试。
- `src/features/editor/EditorPane.tsx`：浮层边界、outside pointerdown / Escape、焦点管理、worktree 切换关闭、入口可访问展开态。
- `src/features/editor/EditorPane.test.tsx`：浮层集成关闭行为及外部操作不被吞掉的回归测试。
- `src/styles/index.css`：History 浮层、标题栏、搜索、分组、列表项、状态、hover/focus 与响应式尺寸。

## Order of work

1. 用户确认本目录方案后，提交获批文档形成审计基线。
2. 先补测试：打开后点击编辑区和编辑区外控件可关闭；内部点击保留；入口再次点击关闭；Escape 关闭并回焦入口；切换 worktree 关闭。增加搜索、日期、空态与选中状态测试。
3. 运行针对性测试，确认新增行为在旧实现下失败（red），提交测试基线；之后不通过削弱测试让实现通过。
4. 在 EditorPane 实现受控关闭生命周期和焦点规则。document capture pointerdown 仅在打开期间注册，排除入口与浮层，cleanup 清理监听。选择会话保持既有打开行为。
5. 重构 ChatHistory 内容及样式：标题栏、搜索框、按日期分组的扁平列表、紧凑时间、活动项标记与状态提示。不改变 API 或后端。
6. 运行针对性测试确认 green，再执行完整 check 和 Renderer build。
7. 使用可用浏览器/Electron 检查明暗主题、窄面板、长标题和滚动列表的截图及交互；无法获取视觉证据时报告限制，不声称完成实机验证。
8. Review diff，更新本计划的验证结果，不修改无关代码。

## Risks

- 最大风险：事件先后顺序使入口 pointerdown 关闭后 click 重开，或 capture 误吞其他控件事件。明确 containment 排除入口、不 preventDefault、不 stopPropagation，并使用完整 pointer + click 序列测试。
- 焦点风险：外部点击后回焦入口会抢走目标控件焦点；只在 Escape 和关闭按钮路径回焦。
- 数据风险：缺失时间、跨日边界和异步 worktree 切换；保护日期解析并保留已有异步 active guard。
- 不采用模态 Dialog/全屏 backdrop：历史选择是轻量临时操作，不应锁住主界面或吞掉首次外部操作。
- 不引入新 Popover 依赖，不扩展到会话删除、重命名或后端搜索。

## Proof

```bash
pnpm exec vitest run src/features/chat/ChatHistory.test.tsx src/features/editor/EditorPane.test.tsx
pnpm check
pnpm build:renderer
```

验收：上述测试及构建退出 0；外部点击、Esc、入口切换及选择后关闭正确；搜索/分组/活动项与状态展示正确；明暗主题和窄面板没有横向溢出，外部操作正常响应。

## Execution results

- Red：旧实现 7 个新增用例失败，包括外部 pointerdown、Escape、搜索/分组、worktree 切换；无效日期触发 `RangeError: Invalid time value`。测试基线提交 `f274691`，实现阶段未修改该测试基线。
- Green：针对性测试 `2 passed` / `15 passed`。
- 最终 `pnpm check`：格式、品牌、lint、双端类型检查全部通过；`Test Files 47 passed (47)` / `Tests 220 passed (220)`。首次全量运行 watcher 的 native recursive 测试超时，单独重跑及最终完整检查均通过；未改 watcher 代码或测试。
- `pnpm build:renderer` 退出 0；保留现有 Monaco 混合动态/静态导入与 chunk 体积警告。
- 使用临时 Vite 预览及 sandboxed Electron BrowserWindow，加载真实 ChatHistory 组件和项目 CSS、24 条 mock 会话，查看 dark/light/narrow 三张截图。标准列表 clientWidth/scrollWidth 均 358，窄面板均 260，无横向溢出；窄面板高 300 时浮层高 282、列表独立滚动。截图在 `/tmp/chat-history-{dark,light,narrow}.png`，未加入仓库。
- 视觉验证是隔离组件预览，不是已打包应用的真实会话端到端验证；EditorPane 的关闭、回焦、选择会话及外部操作通过集成测试验证。
- 命令调整：`pnpm test -- <paths>` 在当前脚本下仍执行全套测试，因此针对性验证改用 `pnpm exec vitest run <paths>`。
