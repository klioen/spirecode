# Spec: Preserve Chat thinking block order

## Requirements

1. Restored assistant messages must project `thinking`, `text`, and `toolCall` blocks in source-array order.
2. Live assistant events must create and update timeline blocks according to Pi's authoritative assistant message content order.
3. Repeated stream updates must replace existing blocks without moving them to the end or duplicating them.
4. Multiple text blocks in one assistant turn must remain independently ordered around thinking and tool blocks.
5. Empty completed assistant text placeholders must remain hidden where the display projection currently uses them only to join adjacent tool operations.
6. Existing tool result correlation, todo ordering, and notice behavior must remain unchanged.

## Design

Introduce stable block-level IDs derived from the assistant message ID and content index. Normalize each assistant block into its own timeline item:

- `thinking` becomes a thinking item.
- `text` becomes an assistant/error message item.
- `toolCall` becomes a tool item when restoring history; live tool cards continue to receive authoritative execution lifecycle events.

For live `message_start`, `message_update`, and `message_end`, emit block events in source order rather than emitting one aggregate text message before all thinking blocks. The reducer's existing keyed upsert then preserves the first observed position while replacing partial content. The final `message_end` snapshot supplies the canonical status and content for every block.

User messages remain one message item because they are not mixed with assistant reasoning/tool blocks in this UI contract.

## Concerns

- Some providers may emit a provisional empty assistant content array at `message_start`; no visible item should be created until a block exists.
- Tool execution may start after a tool-call block has already been projected. Both paths must use the same `toolCallId` so the reducer updates rather than duplicates the tool.
- Error responses with no text block still need one visible error item carrying `errorMessage`.
