# Plan: 修复文件查看器永久 Loading（from `docs/fix-file-viewer-stuck-loading/spec.md` 2026-09-13）

## Files that change

- `src/app/monacoSetup.test.ts`：本地 loader 配置回归。
- `src/app/monacoSetup.ts`：集中初始化本地 Monaco 和 workers。
- `src/main.tsx`：导入完整 Monaco setup。

## Order of work

1. 添加本地 loader 配置测试并确认缺少初始化模块。
2. 创建 setup 模块并绑定 bundle 内 Monaco。
3. 运行目标测试、完整检查和 production bundle。
4. 覆盖安装 `/Applications/SpireCode.app`。

## Risks

直接 import 完整 Monaco 会增加主 bundle 体积，但能够保证离线和 CSP 下可靠启动。后续如需优化，应使用本地动态 import，不能退回 CDN。

## Proof

`pnpm test -- monacoSetup.test.ts`、`pnpm check`、`pnpm bundle`。
