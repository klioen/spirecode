# Spec: New Chat session lifecycle race fix

Status: accepted. Implements `docs/fix-new-chat-session-not-found/intent.md`.

## Behavior

1. `ChatView` first establishes an attachment and hydrates its authoritative snapshot.
2. Session config loads only after that attachment succeeds and remains current.
3. If the view unmounts or a newer effect replaces the attachment, late results do not update config, runtime errors, or global toast state.
4. Detaching a session that is already detached, disposed, or superseded is a no-op.
5. A detach carrying a stale subscription ID cannot remove the current subscriber.
6. Attach/config/send operations for a genuinely unknown session continue to return `CHAT_SESSION_NOT_FOUND`.

## Verification

- Component test proving config is not called before attach resolves.
- Component test proving superseded/StrictMode-like attachment cleanup does not surface a stale not-found error.
- Chat service test proving detach is idempotent for missing sessions.
- IPC/binding coverage proving stale subscription detach cannot detach the current subscriber.
- `pnpm check` passes.
