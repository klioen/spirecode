# Intent: SpireCode 中英文界面
Author: User. Status: draft.

## Problem
SpireCode currently has no application-wide localization mechanism. Most interface copy is hard-coded in English, while parts of Chat are hard-coded in Chinese, so the product is inconsistent and users cannot choose their preferred interface language.

## Proposed outcome
Add a Language setting under Settings > General with two choices: English and 简体中文.

- On first launch, when no valid saved language exists, use English.
- After the user selects a language, that choice persists across restarts.
- Changing the language updates the interface immediately.
- All SpireCode-owned user-visible copy is available in English and Simplified Chinese, including visible labels, buttons, descriptions, loading/empty/error states, confirmations, validation messages, tooltips, accessibility labels, and Electron-owned native dialog copy.
- Dates, times, numbers, plurals, and list summaries use the selected interface locale where they are part of SpireCode UI.
- The document language is kept in sync through the HTML `lang` attribute.

## Affected users and systems
- All SpireCode desktop users.
- Renderer UI across Settings, Workbench, Projects/Worktrees, Files, Changes, Editor, Chat, and shared error/empty states.
- Renderer preference persistence.
- Electron Main native dialogs that contain SpireCode-authored copy.
- Renderer unit and integration tests that query visible or accessible copy.

## Constraints
- Supported languages are exactly `en` and `zh-CN` for this delivery.
- The default language is always English and is not inferred from the operating system or browser locale.
- The Language selector contains only English and 简体中文.
- Project/worktree/file/branch names, paths, source code, diffs, terminal output, Git output, user messages, Agent replies/thinking/tool output/todos, model/provider/extension names, and third-party component content remain unchanged.
- Raw errors or activity supplied by the OS, Git, pi, providers, extensions, or other external systems remain unchanged; SpireCode-owned surrounding labels and known fallback messages are localized.
- UI language does not change the Agent conversation language or inject language instructions into prompts.
- Renderer remains sandboxed; any Main-process language synchronization must use a narrow typed IPC contract.
- No dependency should be added unless the design demonstrates that a small typed internal catalog cannot meet the two-language requirement.

## Open questions
- Confirm that “all copy” means all SpireCode-authored UI copy, while dynamic user/project/Agent/Git/terminal/third-party content remains verbatim.
- Confirm that Electron native dialogs should switch language too; this requires persisting or synchronizing the selected language with Main rather than keeping it solely in Renderer localStorage.
