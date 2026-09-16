# Spec: Chat 模型按 Provider 分组
Status: accepted。 Implements: `docs/chat-model-provider-groups/intent.md`。

## 1. User experience

模型 `<select>` 使用原生 `<optgroup>` 按 `ChatModelOption.provider` 分组。每个 provider 只出现一个分组，分组顺序由该 provider 在后端模型数组中的首次出现位置决定，组内维持原数组顺序。

选项文案优先使用去除首尾空白后的 `model.label`；label 为空时回退到 `model.id`。分组标题已经提供 provider 上下文，因此选项不再重复显示 `provider/`。

## 2. Selection semantics

每个 option 的 value 保持为 `provider/id`。已有 change handler 继续拆分第一个 `/`，向 `onModelChange(provider, modelId)` 传递精确标识；不修改 Chat config DTO、IPC 或 Main。

## 3. Accessibility and states

原有 `aria-label="Model"`、无模型占位、disabled 和 mutation pending 行为保持不变。原生 optgroup 提供 provider 分组语义。

## 4. Acceptance criteria

1. 多个 provider 的模型显示在对应 provider 分组下。
2. 同 provider 的多个模型只产生一个分组，并保持输入顺序。
3. option 显示 label，空 label 回退到 id。
4. 选择模型仍以正确的 provider 和 model id 调用回调。
5. Chat Composer 测试及完整 `pnpm check` 通过。
