# Plan: 修复 GitHub Actions 跨平台安装包生成（from `docs/fix-cross-platform-release-artifacts/spec.md` 2026-09-19）

## Files that change

- `docs/fix-cross-platform-release-artifacts/{intent,spec,plan}.md`：记录 CI 失败证据、设计和验证。
- `scripts/prepare-pi-extensions.mjs`：统一 manifest 相对路径分隔符。
- `scripts/package-electron.mjs`：在 smoke 前注入当前平台锁定的 clipboard native package。
- `scripts/package-helpers.mjs`（新增）：提供可测试的路径归一化、平台 package mapping 和安全复制逻辑。
- `electron/packageHelpers.test.ts`（新增）：跨平台确定性回归测试（放入现有 Vitest include 范围）。
- 必要时 `package.json`/`pnpm-lock.yaml`：仅在验证表明依赖声明需要调整时修改。

## Order of work

1. 添加脚本级失败测试：Windows `\\` 相对路径必须归一化为 `/`；支持的三组 platform/arch 映射正确；不支持组合拒绝。
2. 抽取 helper，并在 Pi extension manifest 中使用 portable path。
3. 实现 current-platform clipboard package 安全复制到 `app.asar.unpacked`，拒绝 symlink，复制后由现有 smoke 验证文件与实际加载。
4. 运行脚本测试、`pnpm check` 和本机 macOS `pnpm bundle`，确认不回归现有产物。
5. 提交并创建 PR；合并后等待 main matrix，确认 macOS/Windows/Linux artifacts 全部上传。

## Risks

- 直接依赖 `require.resolve(<package>/package.json)` 可能受 package exports 限制；使用 `createRequire` 并提供基于 lockfile node_modules layout 的受控解析，不扫描任意路径。
- 复制 native package 后若 electron-builder prepackaged 二次打包忽略 unpacked 目录，会在最终 smoke/CI 暴露；保留 packaged directory smoke，必要时再检查最终 archive。
- symlink 可能逃逸 pnpm virtual store；复制必须解析/验证真实源目录且拒绝内部 symlink。
- 不采用关闭 clipboard smoke 的方案，因为会生成启动后才失败的安装包。

## Proof

```bash
pnpm exec vitest run electron/packageHelpers.test.ts
pnpm check
pnpm bundle
gh run watch <main-run-id> --exit-status
```

验收结果：三平台 bundle job 成功，Actions artifacts 同时包含 `.dmg`、`.exe`、`.AppImage`、`.deb`。
