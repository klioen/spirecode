## Summary

<!-- Describe the user-visible outcome and why this change is needed. -->

## Related work

- Issue:
- Accepted intent/spec/plan: <!-- e.g. docs/<change-slug>/ -->

## Changes

<!-- List the focused implementation and documentation changes. -->

## Risk and boundaries

- Regression risk:
- Security/privacy impact:
- Data or configuration migration:
- Platform/package impact:
- Rollback approach:

<!-- Do not claim Agent/worktree OS sandboxing, signed/notarized releases, automatic updates, or completed legal gates unless this PR supplies verifiable proof. -->

## Verification

<!-- List exact commands and outcomes. -->

```text
pnpm check
```

- [ ] Tests cover new or changed behavior.
- [ ] `pnpm check` passes locally, or I explained the exact blocker below.
- [ ] I ran `pnpm bundle` on each affected native target, or this change does not affect packaging/native behavior.
- [ ] UI changes include redacted screenshots or recordings when useful.

## Contributor checklist

- [ ] I read `CONTRIBUTING.md` and the repository `AGENTS.md`.
- [ ] The change follows an accepted spec/plan, or it is small enough not to require new SDLC artifacts.
- [ ] Renderer/Main authority, relative-path validation, Git argument arrays, and credential boundaries remain intact.
- [ ] Public docs and `CHANGELOG.md` are updated for user-visible changes.
- [ ] The diff contains no credentials, private data, unrelated generated files, or accidental dependency updates.
- [ ] I reviewed the diff for correctness, security/privacy, and compliance with accepted scope.
