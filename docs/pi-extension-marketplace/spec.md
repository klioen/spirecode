# Spec — Pi Extension Marketplace

## Product surface

`Settings → Extensions` contains `Marketplace` and `Installed` tabs.

### Marketplace

- Loads extension-only results from `https://pi.dev/packages`.
- Supports a trimmed text query, `downloads | recent | name` sorting, and numbered pagination.
- Displays package name, description, publisher, monthly downloads, relative publication time, package types, and trusted HTTPS links returned by Main.
- Labels entries as `Community` and explains that Pi Catalog inclusion is not verification.
- Represents loading, empty, unavailable, and retry states without affecting Installed.
- Shows `Install`, `Installing…`, or `Installed` from the authoritative installed-package result.

### Installed

- Preserves the existing resolved-extension inventory.
- Only entries backed by a configured user npm package are manageable.
- User-scoped npm packages expose Update and Uninstall. User-scoped local package sources expose Remove from Pi, which removes only the exact settings reference and never deletes local files. Direct extension files and project-scoped resources remain read-only.
- Mutations are single-flight in the Renderer and serialized in Main.
- Successful mutations refresh the installed inventory and show that agent sessions must be restarted before the change is fully active.

## Trust confirmation

Before installation, a modal identifies the package and publisher and states that extensions run with the Pi agent's OS permissions and may access project files, prompts, tool calls, credentials, environment variables, session data, network, and subprocesses. Installation requires an explicit confirmation action.

Uninstall requires confirmation. Updating does not remove data and may run after direct activation, but still shows the restart notice on success.

## Main-process boundary

### Catalog

- Renderer supplies only `query`, `sort`, and `page`.
- Main constructs the URL for the fixed `https://pi.dev/packages` origin with `type=extension`.
- Query is limited in UTF-8 size; page is a bounded positive integer; sort is an enum.
- Fetch uses a timeout, manual redirect policy, response-size limit, HTML content validation, and a bounded result count. At most one canonicalization redirect is followed, and only when it remains on `https://pi.dev/packages` with `type=extension`; all other redirects fail closed.
- Main parses server-rendered package cards and returns validated plain data. Remote HTML is never passed to Renderer.
- Only HTTPS npm, repository, and Pi Catalog links on expected hosts are returned.
- Catalog parser failure is a typed error and leaves Installed usable.

### Package mutations

- Main accepts only a validated npm package name and constructs `npm:<name>` itself for installation.
- Update accepts only the exact source of a currently configured **user-scoped npm package**.
- Uninstall accepts configured user npm packages. Remove from Pi accepts only exact, unfiltered user local package paths, resolves a relative configured source to PackageManager's installed-path identity in Main, and delegates only to PackageManager's settings removal; it never deletes the local source directory. Unknown, project, Git, filtered, or built-in sources are rejected.
- Main invokes Pi SDK `DefaultPackageManager`; it does not spawn a shell or implement npm installation itself.
- When Pi has no explicit `npmCommand`, Main locates a complete Node.js/npm runtime from the inherited `PATH` or bounded platform-specific user installation roots (including NVM, Volta, fnm, Homebrew, and standard Windows Node locations) and prepends only that runtime directory. An explicit Pi `npmCommand` remains authoritative.
- User scope is represented by SDK calls without `{ local: true }`.
- Mutations are serialized through one queue and authoritative state is reread afterward.

## IPC contracts

- `settings_extension_catalog_list(query, sort, page)`
- `settings_extension_package_install(packageName)`
- `settings_extension_package_update(source)`
- `settings_extension_package_remove(source)`

The existing `settings_extensions_list(worktreeId?)` result gains optional package source and management-kind metadata sufficient to distinguish npm management from removable local settings references, without exposing resolved absolute installation paths to Renderer.

## Package-name validation

Accept npm names matching unscoped `name` or scoped `@scope/name` syntax, using lowercase URL-safe npm identifier characters and a conservative length bound. Reject whitespace, control characters, versions/specifiers, paths, URLs, Git sources, flags, and empty segments.

## Lifecycle and concurrency

- Catalog reads may run concurrently with installed-list reads.
- Main package mutations run sequentially.
- A failed SDK operation does not alter Renderer state optimistically.
- A successful operation returns the refreshed installed inventory.
- SpireCode never hot-injects an extension into a running session and never restarts a session without user action.

## Accessibility and responsive behavior

- Tabs use tab semantics and keyboard-focusable buttons.
- Search, sort, pagination, links, and mutation buttons have accessible names.
- Confirmation dialogs trap focus through the existing Radix dialog primitive and expose title and description.
- Long package names and descriptions wrap or truncate without pushing actions outside the Settings content area.

## Failure behavior

- Offline, timeout, remote schema drift, invalid content, and HTTP failures produce a retryable catalog error.
- Invalid or stale package mutation requests fail closed with `INVALID_ARGUMENT` or `NOT_FOUND`.
- SDK failures surface their safe message and do not report success.
- A link rejected by Main is omitted rather than forwarded.
