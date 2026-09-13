# Plan: 可拖拽 Workbench Panels（from `docs/resizable-workbench-panels/spec.md` 2026-09-13）

## Files that change

- `src/features/workbench/PanelResizeHandle.tsx`：通用 Pointer/Keyboard resize handle。
- `src/features/workbench/PanelResizeHandle.test.tsx`：拖拽、键盘、双击和 ARIA 回归。
- `src/features/workbench/workbenchStore.ts`：三组尺寸、clamp、reset 和 localStorage 持久化。
- `src/features/workbench/workbenchStore.test.ts`：尺寸状态和持久化测试。
- `src/features/workbench/Workbench.tsx`：三个 handle 和 CSS variables。
- `src/features/workbench/Workbench.test.tsx`：handle 可见性测试。
- `src/styles/index.css`：Grid variables、handle hit area、resize cursor 和拖动状态。

## Order of work

1. 为 store 和 resize handle 添加失败测试。
2. 实现尺寸状态、边界限制和 localStorage adapter。
3. 实现通用 resize handle。
4. 将左、右、底三个 handle 接入 Workbench。
5. 验证 Terminal 在布局变化后继续通过 ResizeObserver 同步 PTY。
6. 运行完整检查、bundle 并覆盖安装。

## Risks

- Pointer capture 在 jsdom 和 WKWebView 行为存在差异；实现使用 window 级 move/up cleanup，并把 pointer capture 作为增强而非唯一依赖。
- panel 总宽超过窗口时可能挤压 Editor；单 panel clamp 之外，Workbench 在拖动时还要根据当前容器尺寸保留至少 340px 中央宽度。
- localStorage 可能损坏或不可用；读取和写入必须捕获异常并回退默认值。

## Proof

`pnpm test -- PanelResizeHandle.test.tsx workbenchStore.test.ts Workbench.test.tsx`、`pnpm check`、`pnpm bundle`。
