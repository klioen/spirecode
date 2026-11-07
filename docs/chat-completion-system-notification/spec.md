# Specification: Chat completion system notification

## Behavior

1. Electron Main observes normalized events for every loaded Pi session.
2. When a session with presentation kind `chat` emits `agent_settled`, Main shows a system notification if notifications are supported and the SpireCode window is minimized or unfocused.
3. `agent_end` does not notify because Pi may still continue work after that event.
4. Sessions owned by a Task run, Task intake, or Task verification do not use this notification path; their lifecycle owns its own attention notifications.
5. The notification title is the current Chat session title, limited to 120 characters.
6. The body is localized from the current SpireCode language:
   - Chinese: `Pi 已完成回复。`
   - English: `Pi finished responding.`
7. Clicking the notification restores, shows, and focuses the SpireCode window.
8. Unsupported notifications or notification setup failures must not affect Chat event delivery.
