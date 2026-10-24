# Terminal replay input gate

## Intent

Terminal views recreate xterm when tabs, projects, or views remount. Replayed history can contain terminal queries whose xterm-generated replies must not be sent into the still-running PTY and corrupt the current prompt. Preserve bounded history, live interaction, UTF-8 streaming, and the existing PTY lifecycle.

## Spec

- Treat cached history replay and live delivery as distinct phases.
- Subscribe to live messages atomically with taking the history snapshot so output arriving during replay is buffered without loss or reordering.
- Do not register xterm `onData` until xterm's write completion callbacks confirm all replayed output has been processed.
- Register `onData` before flushing buffered live output so live terminal queries retain their normal responses.
- If disposed during initialization or replay, unsubscribe and never register input or write to the PTY; dispose xterm and related UI resources.
- Keep the 1 MiB history budget, close cleanup, lifecycle messages, and streaming UTF-8 decoding behavior.

## Plan

1. Refactor `terminalStream.subscribe` to return an atomic replay snapshot and live unsubscribe handle.
2. Add a small replay/live coordinator around xterm's write callback and `onData` registration.
3. Integrate the coordinator into `TerminalInstance` and strengthen disposal cleanup.
4. Add regression tests for replay-generated input suppression, post-replay keyboard and live-query input, live output ordering during replay, and disposal during replay.
5. Run focused Terminal tests and the full `pnpm check` gate.

Risk: standard. This changes renderer-side Terminal timing and an internal subscription interface, but does not change IPC, persistent data, security boundaries, or PTY lifecycle contracts.
