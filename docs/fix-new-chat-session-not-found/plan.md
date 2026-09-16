# Plan: 修复 New Chat session lifecycle race（from `docs/fix-new-chat-session-not-found/spec.md` 2026-09-16）

## Files that change

- Add `docs/fix-new-chat-session-not-found/{intent,spec,plan}.md` — diagnosis, accepted behavior, implementation proof.
- Modify `src/features/chat/ChatView.test.tsx` — reproduce attach/config ordering and stale-effect behavior.
- Modify `src/features/chat/ChatView.tsx` — sequence config loading after authoritative attach and guard late results.
- Modify `electron/domains/chat/chatService.test.ts` — prove repeated/missing detach is harmless while ownership remains enforced.
- Modify `electron/domains/chat/chatService.ts` — make detach idempotent without weakening ownership on an existing session.
- Modify IPC tests only if service-level coverage cannot express stale subscription behavior.

## Order of work

1. Add failing tests for config-before-attach and repeated detach.
2. Run focused tests and record the expected failures.
3. Make `ChatService.detach` idempotent for absent records while still rejecting a cross-worktree detach of an existing record.
4. Merge ChatView attachment and config loading into one guarded lifecycle: attach, hydrate, then config.
5. Ensure cleanup detaches only the attachment returned to that effect and ignores all late completions.
6. Run focused Chat tests, then `pnpm check`.
7. Build/run a production-form smoke with isolated user data and verify New Chat produces no session-not-found toast.

## Risks

- The highest risk is hiding a legitimate missing-session error. The fix therefore changes only detach semantics; attach/config retain strict not-found behavior.
- Sequencing config after attach adds one local IPC round trip before selectors become ready, but does not block transcript rendering or composer hydration.
- StrictMode can mount, clean up, and remount effects quickly. Per-effect active flags and attachment-owned cleanup prevent an old result from touching the new lifecycle.
- Alternative rejected: retry config on `CHAT_SESSION_NOT_FOUND`. Retrying masks ownership/lifecycle bugs and retains the race; deterministic sequencing is simpler.

## Proof

```bash
pnpm exec vitest run electron/domains/chat/chatService.test.ts src/features/chat/ChatView.test.tsx src/features/editor/EditorPane.test.tsx
pnpm check
pnpm bundle
```

Manual smoke: launch the built app with isolated user data, select a worktree, click New Chat, and verify the empty session and controls load without a `CHAT_SESSION_NOT_FOUND` toast.
