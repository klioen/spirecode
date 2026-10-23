# Conversational Task intake

## Approved behavior

New Task appears immediately to the right of New Chat. It opens a persistent pi
conversation in the current project, asking for a task description. Main supplies
only bounded read-only tools over an origin branch's pinned Git objects; no
coding, shell, MCP, skills, prompt templates or executable extensions are loaded
in this session. Clarification and execution use separate sessions.

The agent investigates before asking one question at a time, then prepares a
complete title/description including scope, constraints, acceptance criteria and
assumptions. A host-rendered review shows the exact proposal, project, origin
branch and commit. Only a subsequent explicit conversational confirmation
(`确认提交`, `确认`, `开始`, `yes`, etc.) authorizes submission of that review.
Ambiguous or modifying replies revoke authorization. A replacement proposal
requires a fresh confirmation. Assistant prose is never a mutation protocol.

Submission uses a dedicated tool and durable per-intake Task identity. Repeated,
concurrent and crash-retried submissions return the same Task. It enters the
existing durable background queue with automation enabled and a new managed
worktree at the approved commit. Origin branches remain allowlisted. No current
uncommitted edits are copied. The original tab remains with a submitted card and
View task action; closing it never cancels the Task.

Background means while the application is running, not a new OS service. Existing
shutdown/recovery, reporting, notifications and manual review remain in use.
Execution handles ordinary implementation details autonomously, but reports
blocked when objectives/acceptance/authorization require further user input.
Existing Chat and Task form entry points remain unchanged.

## Implementation and verification plan

1. Add Main-owned persistent intake metadata, narrow tools, consent/revision gate
   and idempotent Task creation; restore restrictions through ordinary Chat APIs.
2. Read immutable Git blobs through the hardened runner, reject symlinks,
   traversal, submodules/binary and oversized data. Preserve the approved commit
   through queued workspace provisioning without exposing paths or commit inputs
   to Renderer.
3. Add allowlisted create/get IPC commands, semantic tab metadata, bilingual
   composer/review/submitted UI, and task navigation without automatic focus
   changes.
4. Test consent, invalidation, concurrent/recovered submission, ownership,
   read-only loading/reopening, baseline pinning, UI navigation and normal Chat
   regressions. Run pnpm check.

## Verification before rebase

- Final `pnpm check` passed (exit 0): formatting, brand, localized copy, secrets,
  production license metadata, lint, both typechecks, 97 test files / 755 tests,
  and 19 release tests. The existing user pnpm store was selected through
  `npm_config_store_dir=/Users/bytedance/Library/pnpm/store`; no dependencies or
  lockfile were changed.
- The first sandboxed gate encountered three unchanged native macOS watcher
  timeouts. All five watcher tests passed with native filesystem permissions,
  then the entire gate passed with the same permissions. No test was skipped,
  suppressed, or modified to hide those failures.
- Final `pnpm build` passed (Renderer and Electron Main/preload). Vite retains
  its existing large-chunk advisory.
- Regressions cover exact conversational consent, same-turn submission denial,
  changing replies and replacement proposals, stale origin baseline revocation,
  cancelled submission, concurrent/crash-retried idempotency, ownership,
  restricted Chat attachment/rebinding and empty-session recovery, executable
  resource suppression, immutable blob reading and path/symlink rejection,
  approved-commit worktree provisioning, tab focus/closure/persistence,
  proposal/submitted UI, localized copy, and explicit Task navigation.
- No real model/provider end-to-end execution, native artifact packaging/smoke,
  application reinstall, or Windows/Linux runtime test was performed. Agent
  clarification quality and blocker judgments remain model-driven; Main enforces
  capabilities, proposal identity and submission authorization.


## Rebase and local installation (2026-10-24)

- Fetched origin and rebased the current branch onto `origin/main` at
  `320a272a9ba541a2640d5198a46bdde8ce3b70be`. The old stage-all commit was already
  present upstream and Git skipped its duplicate. New Task changes were restored
  from an include-untracked stash without conflicts, preserving upstream
  searchable dropdowns and Tasks/Projects navigation. All six new files matched
  the pre-rebase backup byte-for-byte before this verification note was added.
- Full post-rebase `pnpm check` passed with native filesystem permissions and the
  existing pnpm store override: 98 test files / 760 tests plus 19 release tests.
  No test was skipped or suppressed; no dependency/lockfile change was needed.
- `pnpm install:mac` passed (exit 0): production build, macOS arm64 packaging,
  local signature verification, App smoke and mounted DMG smoke, staged app
  replacement, installed hash comparison, and application startup all succeeded.
  `/Applications/SpireCode.app` was started; existing application user data was
  not deleted. This is a local development installation, not a notarized release.
- Installed `app.asar` SHA-256:
  `f1d6e75d01a86a69d8ba6df5b5772b09610d2f862d44a083ae07b7f24871dc87`.
- Changes remain uncommitted in the rebased working tree; no remote push was
  performed. The pre-rebase stash and `/tmp/spirecode-before-rebase-20261024-000305`
  backup were retained. Real-provider task execution and Windows/Linux runtime
  verification were not performed.

## PR preparation (2026-10-24)

The feature was rebased again onto `origin/main` at
`391148733ab494aeef8b86488a9a618c2cf911d8` and moved to the dedicated
`feat/conversational-task-intake` branch. Upstream searchable-popover placement,
project/session selection, worktree navigation and spinner styling are retained.

Integration review additionally fixed project-rail reopening: it forwards the
Main-owned intake kind instead of opening the session as ordinary Chat. An
existing untyped tab placement is upgraded when authoritative intake metadata is
available, without duplicating the tab or stripping a previously known kind.
Regression tests cover project-list reopening and ordinary Chat isolation.

Final PR gate after this integration fix passed: 99 test files / 775 tests plus
19 release tests, with native filesystem permissions and the existing pnpm store
override. `pnpm build` also passed after the final code changes. No test was
skipped or suppressed. This last PR rebase did not reinstall the application;
the earlier native installation/database verification remains recorded above.
