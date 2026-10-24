# Chat work summary disclosure

## Intent

Keep ordinary Chat, Task intake, and Task execution conversations focused on the final answer by folding each turn's intermediate work into a stable, user-controlled summary. While work is running, the collapsed row should still communicate the current semantic activity without exposing raw reasoning, tool arguments, output, or errors.

Risk classification: standard change because it alters shared user-visible Renderer behavior and interaction state across Chat and Task surfaces, but does not change Electron/Main, IPC, wire data, persistence, privileges, or task execution.

## Spec

- Shared `Working for …` and `Worked for …` disclosures are closed on first render and never open or close automatically when lifecycle status changes.
- A collapsed running summary shows the latest running Tool or streaming Thinking item in timeline order. Tool activity reuses its existing icon, localized action, and compact semantic object summary; Thinking uses only its localized label and icon.
- The running summary is a single truncating line and never includes raw reasoning, arguments, output, result, stderr, or error details.
- Expanded work preserves timeline order and continues to render Thinking, Tool, Todo, and intermediate assistant messages.
- Tool and Thinking disclosures are also closed on first render regardless of status. User-controlled disclosure state and Tool tab state survive ordinary streaming rerenders.
- Existing duration timing, final-answer placement, notices/errors, scrolling, localization, keyboard/details semantics, focus styles, and reduced-motion behavior remain intact.
- Task intake continues to use the same shared `ChatView` path, so the behavior applies consistently to normal Chat, intake, and execution sessions.

## Plan

1. Add regression tests for closed active/completed work, active-item selection and switching, private-detail exclusion, closed active Tool/Thinking items, and preserved manual disclosure/tab state.
2. Replace lifecycle-driven disclosure state with stable user-controlled state initialized closed.
3. Add a small active-work selector and render the semantic activity inside the running work summary by reusing `toolPresentation` and `ReasoningIcon`.
4. Add narrowly scoped flex/ellipsis styles for a one-line responsive collapsed row.
5. Run focused Chat/Task tests, `pnpm check`, and `pnpm build`; review the diff for scope and accessibility regressions.
