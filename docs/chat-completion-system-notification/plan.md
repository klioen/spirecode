# Plan: Chat completion system notification

1. Add a Main-owned Chat service observer that receives normalized events with session identity, presentation kind, and current title.
2. Wire AppState to show a localized Electron notification for background normal-Chat `agent_settled` events.
3. Add Chat service tests covering observer metadata and settled-event delivery.
4. Run formatting, lint, type checking, and focused tests, then the repository gate where practical.
