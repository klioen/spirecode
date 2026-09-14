# Plan: SpireCode 全量产品身份迁移（from `docs/rename-spirecode/spec.md` 2026-09-14）

## Files that change

- 新增 `docs/rename-spirecode/{intent,spec,plan}.md`：记录命名决策、边界、迁移和证明。
- 重命名 `docs/pi-app/` 为 `docs/spirecode/`，并更新仓库内全部历史设计文档中的旧产品身份、路径和安装产物。
- 修改 `README.md`、`AGENTS.md`、`index.html`：产品名、说明、设计文档链接和 slogan。
- 修改 `package.json`、`pnpm-lock.yaml`：npm package identity。
- 修改 `src-tauri/Cargo.toml`、`src-tauri/Cargo.lock`、`src-tauri/src/main.rs`：Rust package/library/binary identity。
- 修改 `src-tauri/tauri.conf.json`：产品名、窗口标题和 bundle identifier。
- 修改 `scripts/{build-dmg,sign-app,smoke-app,smoke-dmg}.sh`：新 app、binary、DMG、volume 和 bundle id。
- 修改 `src-tauri/src/{filesystem,git,persistence,projects,terminal}/**`：临时资源、线程和 Git 测试身份前缀。
- 修改 `src/features/projects/ProjectRail.tsx`、`src/features/workbench/Workbench.tsx`、`src/app/AppErrorBoundary.tsx` 及相关测试：SpireCode wordmark、`S` 标识和准确 slogan。
- 修改 `src/features/theme/themeStore.ts`、`src/features/workbench/workbenchStore.ts` 及测试：新 persistence key 与旧 key 一次性迁移。
- 新增仓库命名回归检查并接入 `pnpm check`，只允许迁移代码中的两个 legacy key。

## Order of work

1. 先提交本变更的 intent/spec/plan，固定 canonical identity 和迁移边界。
2. 重命名设计目录并批量替换显示名、机器名、Rust identifier、bundle identifier、路径和测试 fixture；随后人工审查 diff，避免把普通语义中的 `pi` 或无关内容误改。
3. 更新 UI 品牌区和空状态，使产品名与准确 slogan 可见，并移除文本 `π` 品牌。
4. 为 theme/workbench storage 实现 `old key -> new key` 迁移，先补迁移测试，再实现迁移逻辑。
5. 更新打包与 smoke 脚本，生成和验证 `SpireCode.app`、`SpireCode_0.1.0_aarch64.dmg`、`spirecode` binary 和新 bundle id。
6. 增加 retired-name guard，扫描 Git tracked text，明确豁免 legacy migration constants。
7. 运行格式化、命名扫描、`pnpm check` 和 `pnpm bundle`；检查 git diff 和 artifact 名称。

## Risks

- 最危险的是 package/crate/binary/app artifact 四层名称不一致，可能编译成功但签名或 DMG smoke 失败；以 bundle smoke 作为最终证明。
- bundle identifier 改变会产生新的 app data/container 身份，Rust durable state 不会自动继承旧应用数据；这是完整品牌迁移的必然后果，不伪装成原 app 的更新。
- localStorage key 直接替换会丢失主题和布局；采用明确的一次性迁移并用测试固定。
- 全局替换可能误伤普通单词、历史技术说明或路径；只替换精确产品 identifiers，并在最后做全量 diff 审查。
- 当前 checkout 目录不在版本化文件中；本次不移动它。若之后移动目录，需要在所有外部工具中重新打开 workspace。
- 不重绘现有图形 icon，因为当前 icon 不含旧品牌文字；避免把品牌迁移扩大成未经设计确认的视觉重做。

## Proof

- Storage migration tests：旧 theme/workbench key 被读取、迁移、删除，新写入只使用 `spirecode.*`。
- UI tests：SpireCode 和 slogan 可见，旧 wordmark 不存在。
- Naming guard：除两个 legacy migration literals 外，tracked text 不含 `Pi App`、`pi-app`、`pi_app`、`pi-ide` 或文本品牌 `π`。
- `pnpm check`：format、lint、typecheck、frontend tests、Rust fmt/clippy/tests 全部退出 0。
- `pnpm bundle`：构建、ad-hoc sign、生成 DMG，并通过 app/DMG smoke。
- Artifact inspection：`SpireCode.app`、`SpireCode_0.1.0_aarch64.dmg` 存在；binary 为 `spirecode`；bundle id 为 `com.bytedance.spirecode.dev`。
