# Spec: SpireCode 中英文界面
Status: proposed. Source: `docs/ui-localization/intent.md`.

## 1. Product behavior

### 1.1 Supported languages

```ts
type AppLanguage = "en" | "zh-CN";
```

Only English and Simplified Chinese are supported. The Settings > General selector exposes two self-identifying options:

- `English` (`en`)
- `简体中文` (`zh-CN`)

There is no persistent “Follow system” option.

### 1.2 Default language

Language is Main-owned durable application state so Renderer UI and Electron native dialogs use the same value.

When no valid saved language exists, SpireCode uses and persists `en`. The operating-system and browser locale are not consulted. Invalid or corrupt persisted values are repaired to `en`.

### 1.3 Switching language

Selecting a language:

1. invokes a narrow typed Main command;
2. validates and atomically persists the new value;
3. updates Renderer state only after Main confirms the write;
4. rerenders all SpireCode-owned UI immediately;
5. sets `document.documentElement.lang` to the selected BCP 47 value;
6. changes subsequent Electron native dialogs immediately without restarting.

If persistence fails, the previous language remains active and the localized error UI is shown.

## 2. Localization boundary

### 2.1 Content that must be localized

All SpireCode-authored user-visible copy:

- headings, navigation, tabs, buttons, select options, descriptions;
- loading, empty, success, retry, conflict, confirmation and validation states;
- placeholders, tooltips, `title`, `aria-label`, accessible status text;
- Chat chrome and SpireCode fallback activity/notice text;
- Settings, Memory, Project/Worktree, Files, Changes, Editor, Terminal and Workbench chrome;
- Electron native unsaved-change dialog;
- SpireCode-owned singular/plural and list summaries;
- dates, times and numbers rendered as application chrome.

### 2.2 Content that remains verbatim

- product and protocol names such as SpireCode and pi;
- project/worktree/file/directory/branch/remote names and paths;
- source files, diffs, patches, terminal input/output and Git output;
- user prompts, Assistant replies, thinking content, tool input/output, todo content;
- model, provider, extension and slash-command names/descriptions supplied externally;
- OS, Git, pi, provider and extension error/activity payloads;
- stable error/status codes and technical units where translation is not meaningful.

SpireCode localizes the chrome around external content. It must not infer a translation key by matching English error-message text.

## 3. Architecture

### 3.1 Main-owned preference

Extend `SettingsService` durable state from version 4 to version 5:

```ts
interface SettingsState {
  version: 5;
  language: AppLanguage;
  overrides: Record<string, boolean>;
  memoryConfig: MemoryConfig;
}
```

`SettingsService.load` initializes missing or invalid language state to `en`. Existing version 4 data receives and persists English as the initial language without changing extension overrides or Memory configuration.

Public methods:

```ts
language(): Promise<AppLanguage>
setLanguage(language: AppLanguage): Promise<AppLanguage>
```

Both use the service's existing `AsyncQueue`; writes use `saveAtomic` and copy-on-write state replacement.

### 3.2 IPC contract

Add allowlisted commands:

- `settings_language_get` → `AppLanguage`
- `settings_language_set` with `{ language }` → `AppLanguage`

Main validates the enum and rejects unexpected fields. Renderer accesses these only through `src/bindings/index.ts`; feature code never invokes raw IPC.

No generic settings, filesystem or locale API is exposed to Renderer.

### 3.3 Renderer bootstrap and store

Add a dedicated localization module under `src/i18n/` containing:

- the `AppLanguage` and translation-key types;
- canonical English catalog;
- complete Simplified Chinese catalog;
- pure translation/interpolation and Intl formatting functions;
- a Zustand language store initialized from Main;
- a React `useTranslation` hook and non-React translation helpers.

`src/main.tsx` reads `settings_language_get` before mounting React. This prevents a first-frame English flash when a saved Chinese preference exists. If bootstrap fails, it renders with English and reports the host error through existing error handling rather than reading browser locale independently.

The Renderer must not duplicate language persistence in localStorage. Existing editor/terminal Renderer settings remain unchanged.

### 3.4 Typed dictionaries

English is the canonical typed catalog. Chinese must satisfy the exact English key set at compile time.

Keys are semantic and stable, for example:

```ts
"settings.general.language.label"
"projects.worktree.delete.runningTerminals"
"chat.history.delete.confirmation"
```

The translator supports named interpolation. Plural-sensitive messages are selected using `Intl.PluralRules`; human-readable lists use `Intl.ListFormat`. Dates/numbers use explicit locale mappings (`en-US`, `zh-CN`) rather than the ambient OS locale.

No runtime i18n dependency is added for two locales. A third-party library is deferred until ICU/extraction/lazy-catalog requirements exist.

### 3.5 React and non-React callers

React components call `useTranslation()` and translate at render time.

Non-React logic must avoid persisting translated text:

- validators return stable reason codes and components translate them;
- tool presentation returns semantic action kinds plus dynamic data;
- Chat fallback notices retain a semantic fallback kind while external event messages remain verbatim;
- internal enum values such as role, terminal state, tab kind and date group are translated only at render time.

This ensures an open window updates immediately when language changes.

### 3.6 Native dialog

The unsaved-change dialog in `electron/main.ts` reads `state.settings.language()` (or a synchronized in-memory getter) at display time and uses a small Main-safe native-dialog catalog. Its plural text and buttons are localized.

Renderer catalogs must not be imported into Main if doing so introduces browser-only dependencies. Shared pure types/catalog data may live in a platform-neutral module; otherwise Main owns only the small native-dialog dictionary.

## 4. UI requirements

Settings > General gains a Language row near Theme:

- English label: `Language`; description: `Choose the interface language.`
- Chinese label: `语言`; description: `选择界面语言。`
- Options remain `English` and `简体中文` in either interface language.

The selected value reflects Main state. Settings and the rest of the open application update immediately after a successful selection.

Existing Settings navigation behavior is unchanged; opening Settings continues to use its current initial section unless separately requested.

## 5. Migration scope

At minimum migrate application-owned copy in:

- `src/app/` fatal startup UI;
- `src/features/workbench/` and Theme toggle;
- `src/features/projects/` and worktree validation/dialogs;
- `src/features/files/`, `src/features/changes/`, `src/features/editor/`;
- `src/features/settings/`, including Memory;
- `src/features/chat/`, including composer, history, messages, process/tool/todo views and reducer fallbacks;
- `electron/main.ts` native unsaved-change dialog.

Existing accidental Chinese-only Chat strings become English in the English catalog and remain Chinese in the Chinese catalog.

Program logic must not select elements using localized copy. In particular, the current Workbench lookup based on `[title="Open project"]` must be replaced by a stable callback/ref or nonlocalized test identifier.

## 6. Testing and guardrails

### 6.1 Unit tests

- deterministic English default regardless of operating-system/browser locale;
- first-launch persistence and version 4 → version 5 migration;
- invalid persisted/input language rejection or repair;
- atomic language update and preservation on failed write;
- exact catalog key parity and named-placeholder parity;
- interpolation, plural, list, date and number formatting in both languages;
- HTML `lang` synchronization;
- native unsaved-change dialog copy/plural behavior.

### 6.2 Component/integration tests

Existing tests run with deterministic English default. Add Chinese coverage for representative surfaces and dynamic accessible labels, plus one test proving a live switch rerenders Settings and another main workbench surface. Add boundary tests showing filenames, branch names and Agent/tool payloads remain unchanged.

### 6.3 Automated copy guard

Add a deterministic repository check to the existing `pnpm check` gate. It scans production Renderer TS/TSX and native dialog sources for newly introduced hard-coded user-facing JSX text and localized attributes (`aria-label`, `title`, `placeholder`) outside approved catalogs. Explicit technical/dynamic exceptions are allowlisted narrowly.

The guard is not a substitute for review of imperative messages, but prevents the most common regression: adding new untranslated visible JSX copy.

## 7. Acceptance criteria

1. Clean first launch starts in English and persists `en`, regardless of operating-system/browser locale.
2. Subsequent launches use the saved language.
4. General offers exactly English and 简体中文; switching either direction updates the open UI immediately and survives restart.
5. All identified SpireCode-owned Renderer and native-dialog copy has both translations, including accessibility copy.
6. Date/number/plural/list UI formatting follows the selected language.
7. Dynamic project, file, Git, terminal, user and Agent content is unchanged.
8. `document.documentElement.lang` matches the selected language.
9. `pnpm check` passes and the copy guard rejects representative new hard-coded UI text.

## 8. Concerns

- **Scope size:** “all copy” touches most Renderer feature surfaces and many tests. Partial migration would violate the requirement, so implementation should be staged internally but delivered only after the full inventory passes.
- **Dynamic Main errors:** current IPC errors often carry complete English messages. External/raw messages remain verbatim. Known app-owned errors may require future structured reason codes if product requires every backend detail translated; message-text matching is explicitly forbidden.
- **Third-party UI:** Monaco, xterm, OS file pickers and other third-party/native content are outside SpireCode-authored copy. Their own localization is not part of this change.
