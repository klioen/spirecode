# Intent: Preserve Chat thinking block order
Author: SpireCode maintainer. Status: approved.

## Problem

Chat often renders an agent's thinking section after the final answer even though Pi stores and streams thinking before the answer. SpireCode currently flattens an assistant message into one text item first and appends thinking items afterward, losing Pi's content-block order in both restored and live conversations.

## Proposed outcome

Render assistant thinking, text, and tool-call blocks in the same order supplied by Pi. Live streaming and restored session snapshots must produce the same timeline order, without duplicate blocks or position jumps as partial messages update.

## Affected users and systems

- Chat transcript rendering for all reasoning-capable providers, including TraeX.
- Electron Main's Pi event normalization.
- Renderer Chat timeline state and process grouping.

## Constraints

- Preserve the sandbox boundary and existing narrow Chat IPC.
- Treat Pi's assistant content array and stream `contentIndex` ordering as authoritative.
- Preserve tool execution updates and process grouping.
- Do not reorder unrelated user messages, notices, or todo snapshots.

## Open questions

None.
