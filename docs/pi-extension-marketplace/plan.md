# Plan — Pi Extension Marketplace

## 1. Establish contracts with red-green tests

- Add catalog and managed-package types to Main and Renderer bindings.
- Extend IPC allowlists and argument validation with bounded query/page/sort and conservative npm source validation.
- Add tests proving unexpected fields, invalid names, arbitrary URLs/specifiers, stale sources, and project/Git sources are rejected; local removal tests must prove only exact configured user path sources are accepted.

## 2. Implement the catalog adapter

- Add `electron/domains/extensions/catalog.ts` with an injected fetch function.
- Construct only fixed-origin Pi Catalog URLs.
- Enforce timeout, manual redirects, response/content limits, and bounded cards.
- Parse the catalog's server-rendered `data-package-*` cards into validated plain objects.
- Cover realistic HTML fixtures, escaped content, pagination, malformed pages, unsafe links, redirects, oversized responses, and network failure.

## 3. Implement package management

- Add `electron/domains/extensions/service.ts` around an injected Pi `PackageManager` factory.
- Construct the production `DefaultPackageManager` with user agent directory and a trusted SettingsManager only for reading current user configuration; package mutations remain user-scoped.
- Map configured user npm sources and removable local settings references to resolved extension inventory without exposing resolved absolute managed install roots.
- Serialize install/update/remove and refresh authoritative extension state after success. Local removal delegates to PackageManager only for settings cleanup and must not delete source files.
- Add service tests with a fake PackageManager before production wiring.

## 4. Wire Main and generated bindings

- Add the extension service to `AppState`.
- Dispatch the four narrow commands in `electron/ipc.ts`.
- Add typed Renderer command wrappers and settings API methods.
- Keep the preload bridge unchanged because it already exposes only allowlisted command invocation.

## 5. Build the Settings experience

- Extract the Extensions section into focused components if needed.
- Add Marketplace/Installed tabs, search, sort, pagination, retry/empty states, package cards, authoritative install state, confirmation dialogs, mutation errors, and restart notice.
- Preserve installed resource information; show Update/Uninstall for npm packages, Remove from Pi for configured user local packages, and read-only behavior for direct/project resources.
- Add English and Simplified Chinese strings and responsive neutral-chrome styles.

## 6. Verify

- Run new domain, IPC, bindings, Settings UI, i18n, and style-contract tests.
- Run formatter, lint, typecheck, and full `pnpm check`.
- Review the final diff for arbitrary URL/command/path exposure, project-settings mutation, unsafe remote rendering, optimistic false success, and accidental official/verified wording.

## Acceptance evidence

- Deterministic tests show fixed-origin catalog ingestion and fail-closed package mutation.
- UI tests show trust confirmation, install single-flight, installed refresh, update/uninstall restrictions, failure recovery, and restart notice.
- `pnpm check` exits successfully.
