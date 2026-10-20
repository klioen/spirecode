# Intent

Align SpireCode's chat activity presentation with Codex: keep the conversation focused on user-visible actions and outcomes rather than exposing raw model reasoning or generic tool payloads.

# Spec

- Raw `thinking` timeline items are not rendered in the Chat UI.
- Tool executions remain visible as semantic action summaries with status, icon, and concise object information such as a command or file basename.
- Tool argument and result payloads are not rendered, including Input/Output tabs, raw JSON, stdout, and diff previews.
- Multiple adjacent tools may still be grouped and expanded into their individual semantic summaries.
- Existing wire events and persisted timeline data remain compatible; this change is presentation-only.

# Plan

1. Add regression expectations for hidden thinking and summary-only tools, and prove they fail against the existing UI.
2. Filter thinking from the display projection and simplify process steps to tool entries.
3. Replace expandable tool detail cards with non-expandable semantic summaries and remove obsolete preview UI.
4. Run focused Chat tests, then the repository verification gate.

Risk: standard user-visible behavior change, but localized to Renderer projection and presentation with no IPC, persistence, execution, or security-boundary changes.
