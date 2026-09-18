# Intent: 文件保存冲突恢复
Author: product owner。 Status: accepted。

## Problem

文件编辑器遇到 `FILE_CONFLICT` 时会保留本地 draft，但只显示错误文字，没有 Reload、Compare 或安全覆盖动作。用户无法判断磁盘内容，也无法在确认后完成保存。

## Proposed outcome

冲突状态提供三个明确操作：

- Reload：放弃本地 draft，重新载入磁盘版本；
- Compare：读取并展示磁盘当前内容，同时保留本地 draft；
- Overwrite：获取最新版本号后覆盖写入本地 draft，继续使用原子写和版本校验。

## Constraints

- 不绕过 Main 的 `expectedVersion` 校验；Overwrite 必须先重新读取最新版本。
- Compare 不把磁盘内容写入 Zustand 或 localStorage。
- 默认不自动覆盖用户修改；所有破坏性动作由显式按钮触发。
