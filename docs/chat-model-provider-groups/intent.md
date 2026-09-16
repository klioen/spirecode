# Intent: Chat 模型按 Provider 分组
Author: keliangliang。 Status: accepted。

## Problem

Chat 输入框的模型选择器当前将所有模型平铺展示，并重复显示 `provider/model`。当用户配置多个 provider 和较多模型时，列表难以快速浏览和定位。

## Proposed outcome

- 模型选择器按照 provider 分组展示可用模型。
- 分组标题显示 provider，组内选项优先显示模型 label，无有效 label 时显示模型 id。
- 模型选择值及切换行为继续使用精确的 `provider/id`。

## Affected users and systems

SpireCode Chat 用户；Renderer 的 Chat composer 及其组件测试。

## Constraints

- 不修改后端模型目录、IPC DTO 或模型切换协议。
- 保持后端返回的 provider 首次出现顺序和每组模型顺序。
- 同名模型仍通过 `provider/id` 唯一识别。

## Open questions

无。
