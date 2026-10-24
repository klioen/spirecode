# Chat work summary disclosure

## Intent

Keep ordinary Chat, Task intake, and Task execution conversations focused on the final answer by folding each turn's intermediate work into a stable, user-controlled summary. While work is running, the collapsed row should still communicate the current semantic activity without exposing raw reasoning, tool arguments, output, or errors.

Risk classification: standard change because it alters shared user-visible Renderer behavior and interaction state across Chat and Task surfaces, but does not change Electron/Main, IPC, wire data, persistence, privileges, or task execution.

## Spec

- Shared `Working for …` and `Worked for …` disclosures are closed on first render and never open or close automatically when lifecycle status changes.
- A running summary shows its duration on the first line and the latest Tool or Thinking activity on a dedicated second line.
- The latest activity remains visible after that Tool or Thinking completes and is replaced only when a later Tool or Thinking item arrives. It disappears when the turn changes from `Working for …` to `Worked for …`.
- Tool activity reuses its existing icon, localized action, and compact semantic object summary; Thinking uses only its localized label and icon. The activity line truncates responsively and never includes raw reasoning, arguments, output, result, stderr, or error details.
- Expanded work preserves timeline order and continues to render Thinking, Tool, Todo, and intermediate assistant messages.
- Tool and Thinking disclosures are also closed on first render regardless of status. User-controlled disclosure state and Tool tab state survive ordinary streaming rerenders.
- Existing duration timing, final-answer placement, notices/errors, scrolling, localization, keyboard/details semantics, focus styles, and reduced-motion behavior remain intact.
- Task intake continues to use the same shared `ChatView` path, so the behavior applies consistently to normal Chat, intake, and execution sessions.

## Plan

1. Add regression tests proving the activity occupies a dedicated line, remains after completion, and switches only when a later Tool or Thinking arrives.
2. Change the active-work selector to retain the latest Tool or Thinking item for the lifetime of a running turn.
3. Split the running summary into a duration heading row and a responsive, truncating activity row while reusing `toolPresentation` and `ReasoningIcon`.
4. Run focused Chat tests and `pnpm check`; review the diff for scope and accessibility regressions.
