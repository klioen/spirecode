# Spec: 二态主题切换
Status: accepted。 Implements: `docs/fix-two-state-theme-toggle/intent.md`。

## Theme model

公开主题状态仅支持 `light | dark`。主题按钮点击后在两者之间切换，并将结果持久化到 `spirecode.appearance.v1`。

## Existing setting migration

- 当前 key 为 `spirecode.appearance.v1` 且值为 `light` 或 `dark` 时直接复用。
- 当前 key 值为 `system` 时，根据启动时 `prefers-color-scheme` 解析为 `light` 或 `dark`，并立即将解析结果写回当前 key。
- 产品更名前的旧 appearance key 为 `light` 或 `dark` 时迁移到当前 key 并删除旧 key。
- 旧 key 为 `system` 时同样按启动时系统外观解析、写回当前 key 并删除旧 key。
- 无有效设置时，首次启动按启动时系统外观选择并持久化；运行期间不再跟随系统变化。

## Theme control

右上角按钮仅显示太阳或月亮图标。`title` 与 `aria-label` 表明当前主题和点击后的目标主题，不再出现 system 或电脑图标。

## Compatibility

`resolved` 状态继续保留为 `light | dark`，避免影响 Monaco、xterm 和根节点 `data-theme` 的消费者。

## Proof

- store 测试覆盖首次启动、已有显式模式、当前/旧 `system` 值迁移和二态循环。
- component 测试覆盖太阳/月亮状态、无电脑模式以及连续切换。
- `pnpm check` 全部通过。
