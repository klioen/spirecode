# Intent

Users need to see when Pi is actively working without keeping a Chat tab selected. The Project rail should show a compact loading indicator on a Worktree with an active Pi Chat session and on its owning Project. Directory Projects, which hide their synthetic workspace row, should show the aggregate indicator on the Project row.

# Spec

- A Pi session is active when its Renderer Chat runtime status is `streaming`, from `agent_start` until `agent_settled`, failure, deletion, or removal.
- Chat conversation loading, idle sessions, failed/auth-required sessions, terminals, filesystem loading, and managed Worktree creation do not count as active Pi sessions.
- A Worktree row displays an accessible loading indicator when at least one of its sessions is active.
- A Project row displays the indicator when any of its Worktrees has an active session.
- A directory Project displays the Project indicator for its synthetic primary workspace; it does not expose a Worktree row.
- Multiple active sessions aggregate as a boolean; the UI does not show a count.
- The indicator updates from the existing Chat runtime event stream. No polling, new IPC command, durable state, or arbitrary path access is added.
- Activity remains visible if the user switches away from the running Chat tab because the runtime retains session state.
- Removing a session removes its contribution to activity.

# Plan

1. Extend `ChatRuntime` with a global activity subscription and a hook that derives active Worktree IDs from runtime states.
2. Add red-green tests for streaming transitions, multiple sessions, settled/error/removal behavior, and global notification batching.
3. Consume the activity selector in `ProjectRail`, aggregate Worktree activity to Project activity, and render accessible compact spinners on Project and Worktree rows.
4. Add ProjectRail tests for Git Project aggregation, inactive rows, and directory Project aggregation.
5. Add localized accessible labels and minimal CSS that does not displace existing Worktree/menu actions.
6. Run focused tests and `pnpm check`.

Risk: standard. This changes visible Renderer behavior and shared in-memory Chat runtime APIs, but does not change IPC, persistence, filesystem access, authentication, or Main security boundaries.
