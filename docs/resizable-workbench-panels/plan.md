# Plan: 可拖拽 Workbench Side Panels（from `docs/resizable-workbench-panels/spec.md` 2026-09-13）

> Terminal 底部 panel 已被 `docs/terminal-center-tabs/` 取代；当前实现仅保留左右 resize handle。

## Files that change

- `src/features/workbench/PanelResizeHandle.tsx`：通用水平 Pointer/Keyboard resize handle。
- `src/features/workbench/PanelResizeHandle.test.tsx`：拖拽、键盘、双击和 ARIA 回归。
- `src/features/workbench/workbenchStore.ts`：左右尺寸、clamp、reset 和 localStorage 持久化。
- `src/features/workbench/workbenchStore.test.ts`：尺寸状态和持久化测试。
- `src/features/workbench/Workbench.tsx`：左右 handle 和 CSS variables。
- `src/features/workbench/Workbench.test.tsx`：handle 可见性测试。
- `src/styles/index.css`：Grid variables、handle hit area 和 resize cursor。

## Order of work

1. 为 store 和 resize handle 添加失败测试。
2. 实现尺寸状态、边界限制和 localStorage adapter。
3. 实现水平 resize handle。
4. 将左、右两个 handle 接入 Workbench。
5. 运行完整检查、bundle 并覆盖安装。

## Risks

- Pointer capture 在 jsdom 和 WKWebView 行为存在差异；实现使用 window 级 move/up cleanup。
- panel 总宽超过窗口时可能挤压 Editor；拖动和窗口 resize 都保留至少 340px 中央宽度。
- localStorage 可能损坏或含旧 Terminal 字段；读取异常回退默认值，旧字段忽略。

## Proof

`pnpm test -- PanelResizeHandle.test.tsx workbenchStore.test.ts Workbench.test.tsx`、`pnpm check`、`pnpm bundle`。
