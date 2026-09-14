# Intent: 将产品统一重命名为 SpireCode
Author: keliangliang。 Status: accepted。

## Problem

项目当前仍使用开发阶段名称 `Pi App`、`pi-app`、`pi_app`、`pi-ide` 和文本标识 `π`。这些名称会让用户误以为产品已经绑定 pi；实际产品需要保持独立品牌，同时允许未来集成 pi agent 或其他 Code Agent。

## Proposed outcome

将所有产品身份统一为：

- 产品显示名：`SpireCode`
- 机器可读名称：`spirecode`
- Rust library：`spirecode_lib`
- 开发 bundle identifier：`com.bytedance.spirecode.dev`
- slogan：`Fast Lightweight GUI Code Agent`
- 文本品牌标识：`S`

应用、安装包、二进制、配置、脚本、持久化 key、测试、文档和源码内部临时资源前缀均不再使用旧产品名称。升级后应兼容迁移旧的前端持久化设置，避免主题和工作台布局丢失。

## Affected users and systems

- macOS 应用窗口、侧栏品牌区、空工作台、错误页和安装包。
- npm package、Rust package/library/binary、Tauri bundle identifier。
- DMG 构建、签名和 smoke test 脚本。
- localStorage 中的主题与工作台状态。
- README、AGENTS.md 和所有版本化设计文档。

## Constraints

- 不改变现有功能或依赖版本。
- 旧 localStorage key 只用于一次兼容读取，新写入统一使用 `spirecode.*`。
- 历史文档中的旧品牌也统一更新，保持仓库全局命名一致。
- 不在代码变更中重命名当前磁盘 checkout `/Users/bytedance/Code/pi-ide`，避免使正在运行的工作区与工具会话失效；仓库目录可在提交后单独移动。
- 不修改不含旧品牌文字的现有应用图标资源。

## Open questions

无。
