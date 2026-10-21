# Change: Codex-style Chat work summary

Status: implemented.

## Intent

SpireCode Chat currently projects tool calls as one or more process rows mixed into the transcript. Even though details are compact, the intermediate execution remains visually prominent and breaks the final answer reading flow. The desired behavior is to keep user messages and the final assistant answer primary while folding reasoning/tool/todo/intermediate assistant activity into one quiet per-turn summary.

Reference behavior was inspected from the shipped Codex/ChatGPT Electron artifact `/Applications/ChatGPT.app/Contents/Resources/app.asar` (SHA-256 `5ddc4e48259aa6f979e04529b1a5a4ae54b0f5c4ad6db5c6e004924c10916ddb`). Static source evidence shows that Codex creates a synthetic `worked-for` item with `working`, `worked`, or `unknown` status; inserts it immediately before the final assistant message; measures completed work to the start of the final assistant response; formats compact localized durations; and ticks an active duration every second. REA Evidence: `ev_e7b5322128c06f159ccd57bfa4c18881a00454a67ff0b7d2556223302e58e089`. The selected 14 MB frontend bundle exhausted the isolated analyzer heap, so semantic graph coverage is partial; these conclusions were additionally checked against the inert shipped JavaScript bytes and are static observations, not runtime proof.

## Spec

- Keep user messages and the final non-empty assistant message of each turn in the main transcript.
- Fold thinking, tool calls, todo state, and assistant text that precedes later work into one closed `<details>` row immediately before the final answer.
- A direct answer with no intermediate work must not get a work summary.
- While a turn has intermediate work but no final answer, show `Working for {time}` and update the compact duration once per second.
- Once the final answer starts, freeze the duration and show `Worked for {time}`, even if the final answer is still streaming.
- For completed history, derive start/end from authoritative message timestamps. If a timestamp is absent, use a stable local fallback rather than allowing a completed duration to continue increasing.
- Expanding the row exposes semantic tool summaries, todo progress, a generic Thinking row, and any folded assistant update. Raw thinking content and raw tool result payloads remain hidden.
- Retry, compaction, and error notices retain their existing independent status/error rendering.
- Duration formatting uses compact localized units (`45s`, `1m 5s`, etc.). English labels match Codex; Simplified Chinese receives equivalent localized labels.
- This is Renderer-only. It must not change Main authority, IPC contracts, persisted Pi sessions, or session transcripts.

## Plan

Risk: standard. The change is user-visible and spans projection, components, localization, CSS, and tests, but it does not alter persistence, IPC, filesystem/security boundaries, or dependencies.

1. Replace tool-only projection with a per-turn projection that identifies the final assistant answer and emits a synthetic work item before it.
2. Add pure projection tests for direct answers, completed work, active work, intermediate assistant text, todo/thinking/tool folding, and notice boundaries.
3. Add a `WorkSummary` component with compact duration formatting, active one-second ticking, closed-by-default details, and accessible labels.
4. Reuse existing semantic `ToolCard`, `TodoListCard`, `ChatMessage`, and Markdown rendering inside the expanded body; do not expose raw tool results or raw thinking.
5. Update `ChatView`, bilingual strings, process CSS, layout tests, and user-visible changelog.
6. Run focused tests, `pnpm check`, package the macOS arm64 app, and verify the running/completed states in the packaged UI.
