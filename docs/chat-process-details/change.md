# Chat process details

## Intent

Restore inspectable model thinking and tool-call details in the shared Chat timeline without losing the existing low-noise work duration and semantic process summaries. The same interaction must apply to ordinary Chat, Task intake conversations, and Task execution sessions opened in Chat.

Risk: standard change because it alters shared, user-visible Chat behavior across several components, but it does not change IPC, persisted data, or security boundaries.

## Spec

- A work summary is open while its turn is active and collapses when the turn completes; subsequent ordinary renders preserve the user's disclosure choice.
- Every thinking item is a semantic disclosure that renders its actual streaming `content` as safe plain text. The active item opens by default and collapses when it completes.
- Every tool item retains its semantic summary and adds an expandable detail with Input and Output tabs. Input is selected when present, otherwise Output. Streaming results, terminal results, and errors update in place without resetting a valid user-selected tab.
- Detail text uses readable string or JSON serialization. At most 16,000 content characters are rendered or copied, with a separate visible truncation notice when needed. Empty values have an explicit localized state.
- Thinking and the active tool tab provide keyboard-accessible copy controls and feedback. Tabs expose semantic tab/tab-panel relationships and keyboard navigation.
- Detail panes have bounded internal scrolling and contained overscroll. Existing Todo, intermediate/final messages, duration, semantic summaries, smart scrolling, and Task navigation remain unchanged.

## Plan

1. Add regression coverage for thinking content/streaming, tool tabs/copy/truncation/status updates, disclosure defaults and user choice, bounded scrolling, and the shared Task intake Chat path.
2. Add shared safe detail serialization/rendering, restore dedicated thinking and tool-detail components, and control disclosure state only at lifecycle transitions.
3. Integrate the components into `WorkSummary`, add localized accessible copy/empty/truncation labels, and restore bounded detail styling with reduced-motion/focus support.
4. Run focused Chat/Task/timeline/scroll tests, then formatting, lint, typecheck, build, and the full project gate when feasible.
