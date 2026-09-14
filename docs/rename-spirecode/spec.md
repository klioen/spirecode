# Spec: SpireCode 全量产品身份迁移
Status: accepted。 Implements: `docs/rename-spirecode/intent.md`。

## 1. Canonical identity

| Surface | Value |
|---|---|
| Product name | `SpireCode` |
| Display wordmark | `SPIRECODE` |
| Slogan | `Fast Lightweight GUI Code Agent` |
| Package/crate/binary | `spirecode` |
| Rust library | `spirecode_lib` |
| Bundle identifier | `com.bytedance.spirecode.dev` |
| Persistence prefix | `spirecode` |
| Text brand mark | `S` |

## 2. Runtime and packaging

- Tauri product name and window title become `SpireCode`.
- macOS artifact names become `SpireCode.app` and `SpireCode_0.1.0_aarch64.dmg`.
- Executable name becomes `spirecode` and smoke tests verify the new bundle identifier.
- DMG volume name becomes `SpireCode`.
- npm and Cargo package names become `spirecode`; Rust entrypoint calls `spirecode_lib::run()`.
- Internal temporary path/thread prefixes use `spirecode-*`.
- Git test identity uses `user.name=SpireCode`.

## 3. UI

- Project rail displays an `S` brand mark and `SPIRECODE` wordmark.
- Empty workbench displays `S`, product name, and the exact slogan `Fast Lightweight GUI Code Agent`.
- Fatal error page uses the `S` mark and names SpireCode in its heading.
- HTML document title and README use SpireCode.

## 4. Persistence migration

- Theme key changes from `pi-app.appearance.v1` to `spirecode.appearance.v1`.
- Workbench key changes from `pi-app.workbench.v1` to `spirecode.workbench.v1`.
- On first access, if the new key is absent and the old key exists, read the old value, write it under the new key, and remove the old key.
- Tests cover migration and all new writes.

## 5. Repository-wide cleanup

- Rename `docs/pi-app/` to `docs/spirecode/` and update links/content.
- Update all tracked source, tests, scripts, manifests, lockfiles, README, AGENTS.md, and historical design artifacts that use the retired names.
- A guard test or deterministic repository check must fail if retired product identifiers remain in tracked text files, while allowing the two legacy localStorage literals required for migration.
- Test fixture values that merely resemble the old repository name are also renamed for a clean global identity.

## 6. Acceptance

- `git grep` finds no retired product identity outside explicitly documented legacy migration constants.
- `pnpm check` exits 0.
- `pnpm bundle` exits 0 and produces/smoke-tests the renamed app and DMG.
- No dependency version changes are introduced.

## Concern: existing installed app identity

Changing the bundle identifier means macOS treats SpireCode as a distinct application rather than an in-place update of Pi App. The old installed app may remain until manually removed. This is intentional because the request is a full product identity migration.
