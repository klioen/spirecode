# Plan: Chat completion system notification

1. Add a Main-owned Chat service observer that receives normalized events with session identity, presentation kind, and current title.
2. Wire AppState to show a localized Electron notification for every normal-Chat `agent_settled` event when the platform supports notifications.
3. Add tests covering observer metadata, settled-event delivery, and focused-window notification behavior.
4. Run formatting, lint, type checking, and focused tests, then the repository gate where practical.
