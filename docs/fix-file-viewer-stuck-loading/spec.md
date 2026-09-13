# Spec: 将 Monaco React loader 绑定到本地 bundle
Status: accepted。 Implements: `docs/fix-file-viewer-stuck-loading/intent.md`。

## Requirements

- `@monaco-editor/react` 必须使用本地打包的 `monaco-editor`，不得访问 CDN。
- Editor 和 DiffEditor 沿用现有本地 workers。
- 生产 CSP 继续禁止远程脚本。
- 文件内容读取成功后 Monaco 必须能完成初始化。

## Design

新增单一 `monacoSetup.ts` 启动模块：导入本地 `monaco-editor`、加载 worker 环境，并执行 `loader.config({ monaco })`。应用入口只导入该模块，避免 workers 和 loader 初始化分散。

## Proof

单测 mock loader 和本地 Monaco，断言启动模块执行 `loader.config({ monaco })`。生产 build 必须包含本地 Monaco/worker assets。运行完整检查和 bundle。
