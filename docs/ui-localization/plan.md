# Plan: SpireCode 中英文界面（from `docs/ui-localization/spec.md`）

## Files that change

### SDLC artifacts

- `docs/ui-localization/intent.md` — approved first-launch language behavior and scope.
- `docs/ui-localization/spec.md` — product and architecture contract.
- `docs/ui-localization/plan.md` — implementation sequence and proof.

### Shared locale and Main persistence

- Add a platform-neutral language type module under `electron/domains/settings/` or a shared contract-safe location.
- `electron/domains/settings/index.ts` — migrate persisted state to v5, default missing/invalid language to English, expose queued get/set operations.
- `electron/domains/settings/settings.test.ts` — red-green tests for the deterministic English default, migration, validation and persistence.
- `electron/appState.ts` — initialize settings with the deterministic English default and expose current language to native UI.
- `electron/contracts.ts`, `electron/contracts.test.ts` — add language get/set commands.
- `electron/ipc.ts`, `electron/ipc.test.ts` — validate and route narrow language commands.
- `src/bindings/generated.ts`, `src/bindings/index.ts`, associated contract tests — add `AppLanguage` DTO and typed commands.
- `electron/main.ts` plus a focused native-dialog helper/test — localize the unsaved-change confirmation using current Main language.

### Renderer localization foundation

- Add `src/i18n/` typed English and Simplified Chinese catalogs, pure translation/interpolation/plural/list/date/number helpers, language store and React hook.
- Add `src/i18n/*.test.ts` for catalog parity, formatting, initialization, live updates and HTML `lang`.
- `src/main.tsx` — bootstrap language from Main before the React render.
- `src/app/AppErrorBoundary.tsx` and tests — localize fatal startup copy without relying on a hook-only API.
- `src/features/settings/settingsApi.ts` — expose feature-facing language API.

### Renderer copy migration

- `src/features/settings/SettingsDialog.tsx`, `MemorySettings.tsx`, and tests — add the General language selector and localize all Settings/Memory copy.
- `src/features/workbench/Workbench.tsx`, `PanelResizeHandle` call sites, tests — localize workbench chrome and remove the localized-title DOM selector.
- `src/features/theme/ThemeToggle.tsx` and tests — localize dynamic mode/action labels.
- `src/features/projects/ProjectRail.tsx`, `WorktreeDialog.tsx`, `worktreeValidation.ts`, and tests — localize actions, validation, dialogs and plural text while preserving names/branches.
- `src/features/files/FileTree.tsx` and tests — localize app states only.
- `src/features/changes/ChangesPanel.tsx` and tests — localize view controls, groups, statuses and change counts.
- `src/features/editor/EditorPane.tsx`, relevant editor-store display modeling, and tests — localize loading/conflict/tab/terminal/empty states without storing language-frozen labels.
- `src/features/chat/ChatComposer.tsx`, `ChatHistory.tsx`, `ChatView.tsx`, `ThinkingBlock.tsx`, `ProcessIcon.tsx`, `ProcessFlow.tsx`, `TodoListCard.tsx`, `ChatMessage.tsx`, `MarkdownContent.tsx`, `ToolPreview.tsx`, `ToolCard.tsx`, `sessionReducer.ts`, associated models and tests — localize all SpireCode Chat chrome and semantic fallbacks while preserving external content.

### Guardrails

- Add `scripts/check-localized-copy.mjs` with narrowly documented exceptions.
- Add focused tests/fixtures for the guard.
- `package.json` — include the localization guard in `pnpm check` without changing dependencies.
- Update `AGENTS.md` only if implementation reveals a repeated localization pitfall; keep it concise.

## Order of work

1. **Red: persistence and default behavior.** Write failing Main tests for the English default, v4 migration, first-launch persistence, language get/set and invalid input.
2. **Green: Main preference.** Implement `AppLanguage`, SettingsState v5 migration, queued atomic get/set, and AppState initialization.
3. **Red/green: IPC contract.** Add failing contract/IPC tests, then implement typed language get/set through contracts, preload-compatible bindings and feature API.
4. **Red/green: translation core.** Add English canonical catalog, Chinese exact-key catalog, translation/interpolation and Intl helpers with parity and formatting tests. Implement Renderer store initialized only from Main and synchronize HTML `lang`.
5. **Bootstrap safely.** Resolve language before React mount; make fatal startup copy use the initialized/fallback language and test the failure path.
6. **Settings first.** Add the General Language control and migrate all Settings/Memory copy. Prove English first-launch rendering, Chinese rendering, successful live switch and failed-save rollback.
7. **Migrate global chrome.** Translate Workbench, Theme, Project/Worktree, Files, Changes and Editor surfaces. Replace code paths that depend on English labels with stable callbacks/state.
8. **Migrate Chat.** Refactor language-frozen tool/notice/status modeling to semantic values, translate every Chat-owned label, use selected locale for time/number/list formatting, and preserve Agent/tool payloads verbatim.
9. **Native dialog.** Extract pure localized unsaved-change dialog options, wire current language, and test singular/plural English and Chinese output.
10. **Copy guard.** Inventory remaining production strings with `rg`, build the deterministic hard-coded-copy check, seed a failing fixture/test, then wire it into `pnpm check`.
11. **Full verification.** Run formatting, guard, lint, typecheck, Renderer/Electron tests, production build, and inspect the final diff/string inventory. Fix implementation only; do not weaken acceptance tests or broad-allowlist the guard.

## Risks

- **Largest risk — incomplete coverage:** user-visible copy is spread across more than twenty files, including non-component reducers/validators and accessibility attributes. Mitigation: typed complete catalogs, repository-wide inventory before and after, and a code guard in `pnpm check`.
- **Most dangerous step — language-frozen state:** translating when reducer/store data is created would leave already-open tabs/notices in the old language. Mitigation: preserve semantic kinds/reason codes and translate at render time; external free text remains verbatim.
- **Persistence split-brain:** localStorage-only language would make Main native dialogs disagree with Renderer. Mitigation: Main is the single durable source; bootstrap Renderer through narrow typed IPC.
- **Startup flash/failure:** mounting before the language read can briefly show English when a saved Chinese preference exists. Mitigation: await language bootstrap before React render and retain a deterministic English emergency fallback.
- **Test brittleness:** accessible-name tests depend heavily on copy. Mitigation: test helpers set deterministic language; test both locales only at representative integration points while catalog tests guarantee completeness.
- **False-positive guard:** a naive scanner may flag technical strings or miss imperative copy. Mitigation: target obvious user-facing JSX/attributes first, keep exceptions narrow and reviewed, and retain manual `rg` inventory for imperative messages.
- **Raw external errors remain English:** translating arbitrary Git/pi/OS messages would corrupt diagnostics. Mitigation: preserve external messages and localize only surrounding chrome/known semantic fallbacks; structured error-reason migration is a separate change if required.

## Rejected alternatives

- **`react-i18next`/FormatJS now:** rejected because two static locales need no extraction pipeline, lazy loading or ICU runtime; typed internal catalogs and native `Intl` cover current requirements without a new dependency.
- **Renderer localStorage language:** rejected because Electron native dialogs also require localization and must share one durable language.
- **Following or detecting system language:** rejected by product decision; missing/invalid preferences always default to English.
- **Browser `navigator.language` and Electron `app.getLocale()`:** rejected as language defaults; neither affects the initial language.
- **Translate error strings by matching English text:** rejected because it is brittle and can alter external diagnostic content.
- **Translate only visible text:** rejected because tooltips, placeholders and accessibility labels are part of the requested UI copy.

## Proof

Run targeted tests during red-green work, then the complete gate:

```bash
pnpm exec vitest run electron/domains/settings/settings.test.ts electron/contracts.test.ts electron/ipc.test.ts
pnpm exec vitest run src/i18n src/features/settings/SettingsDialog.test.tsx src/features/settings/MemorySettings.test.tsx
pnpm exec vitest run src/features/workbench src/features/theme src/features/projects src/features/files src/features/changes src/features/editor
pnpm exec vitest run src/features/chat
pnpm check
pnpm build
```

Final evidence must include:

- tests showing first launch always resolves to and persists English;
- a live English ↔ Chinese UI switch test;
- native dialog English/Chinese singular/plural tests;
- catalog and placeholder parity tests;
- external dynamic content preservation tests;
- localization guard negative/positive fixtures;
- repository-wide search showing no unapproved SpireCode-owned hard-coded UI copy outside catalogs;
- clean `pnpm check` and `pnpm build` output.
