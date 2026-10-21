# Plan: Correct project hierarchy and worktree ownership

Status: implemented.

## Implementation

1. Add red ProjectService tests for a session candidate rooted at a managed worktree, startup cleanup of an existing standalone duplicate, active selection remapping, timestamp merging, exact-root-only behavior, and preservation of non-duplicate projects.
2. Add red Projects rail/style tests that pin one indentation step for worktrees and directory sessions and a second step for Git-worktree sessions.
3. Add narrow catalog reconciliation before session upsert and make project upsert reuse an existing non-main worktree owner.
4. Adjust only Projects tree indentation CSS; do not change DOM nesting, interaction logic, or drag behavior.
5. Update the changelog and this plan with verification evidence.
6. Run focused tests, `pnpm check`, macOS arm64 `pnpm bundle`, and packaged UI smoke. Commit, push, create a focused PR, and atomically install the verified application.

## Verification

```text
pnpm exec vitest run \
  electron/domains/projects/projects.test.ts \
  src/features/projects/ProjectRail.test.tsx \
  src/styles/themeTokens.test.ts
pnpm check
pnpm bundle
```

Verification completed on 2026-10-21:

- Red phase reproduced all three failures: Git worktrees and directory sessions had incorrect offsets, explicit/session discovery created a second project for a managed worktree, and a seeded duplicate survived startup.
- Focused suite: project domain, ProjectRail, and CSS token tests passed (3 files, 54 tests).
- `pnpm check`: formatting, brand, localization, secrets, licenses, lint, both TypeScript projects, 76 Vitest files with 530 tests, and 18 release tests passed. The first two full runs exposed the pre-existing watcher 5-second race; its isolated test passed before the final complete green run.
- `pnpm bundle`: macOS arm64 build, strict ad-hoc signature verification, packaged app smoke, DMG creation, and mounted-DMG smoke passed.
- Packaged CDP smoke used an isolated copy of the real catalog: startup reduced 49 projects to 45 by reconciling four exact managed-worktree duplicates, including `files-panel`, with zero duplicates remaining. The rendered icon offsets were exactly `project -> worktree = 14px`, `directory project -> session = 14px`, and `worktree -> session = 14px`; 111 directory sessions and 146 worktree sessions were exercised.
- Packaged `app.asar` SHA-256: `17843b7e7691cbe9dec9de9626175815cfca205a3ae971fee9fa1a726a75d810`.
- DMG SHA-256: `ef4acda3ed617f8b9fe05feaf48b2b52d29fd4d77a44402d64daa1a16a98a072`.

## Rollback

Revert the focused commit. No filesystem rollback or catalog schema migration is required. A reconciled duplicate can be opened again manually by an older build, but its files and sessions remain untouched throughout.
