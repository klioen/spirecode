# Intent

SpireCode currently puts the Projects-panel toggle and Settings action in the workspace top-right chrome, while Settings opens as a modal over an otherwise active workspace. This makes the left project surface feel disconnected from its own controls and constrains increasingly rich settings content to a small dialog.

Adopt Orca's useful navigation pattern without importing its product complexity: place the Projects toggle in the Projects panel header, place Settings at the panel footer, and make Settings a dedicated full-window page with its own back action, search, grouped navigation, and spacious content surface.

# Spec

- The open Projects panel shows its toggle in the panel's top brand/header row, not in the workspace top-right action cluster.
- When Projects is collapsed, a compact toggle remains available at the former top-left panel edge so the panel can always be reopened.
- The Settings entry sits at the bottom of the Projects panel and is keyboard accessible.
- Settings opens as a full-window application page, replacing workspace chrome rather than using a backdrop, modal dialog, focus trap, or close icon.
- Settings provides:
  - an explicit “Back to workspace” action;
  - a sidebar search field that filters Settings sections;
  - grouped, icon-labelled navigation with `aria-current` on the active section;
  - a centered, scrollable content column with section headers and contained setting surfaces;
  - existing General, Agent, Skills, Memory, Extensions, Editor, and Terminal behavior without changing persistence or IPC.
- Manual Settings entry opens General. Agent-readiness failures continue to open Agent automatically.
- Theme selection exists only in Settings; the workspace top bar does not expose a theme toggle.
- Returning to the workspace preserves panel widths/collapse state, active project/worktree, editor resources, and right-panel state.
- English and Simplified Chinese copy remain complete.
- No new dependency, Renderer authority, Main IPC, persistence schema, or product capability is introduced.

# Plan

Risk classification: standard. This is a cross-module, user-visible navigation and layout change, but it does not alter filesystem/Git safety boundaries, IPC, persistence formats, or irreversible data.

1. Add failing Workbench, ProjectRail, and Settings tests for relocated controls, full-page navigation, back behavior, grouped search, active-section semantics, and readiness entry.
2. Convert the existing Settings dialog shell into a controlled full-window Settings page while retaining the existing section implementations and data APIs.
3. Move Settings and the open-panel toggle into ProjectRail via explicit callbacks owned by Workbench; add a collapsed-edge reopen control outside the unmounted rail.
4. Replace modal CSS with Orca-inspired page sidebar, search, navigation groups, centered content, contained rows, focus, and responsive behavior.
5. Keep theme selection in General Settings and remove the redundant workspace shortcut.
6. Update localized copy, changelog, and style-contract tests.
7. Run targeted tests, `pnpm check`, `pnpm build`, `git diff --check`, then update the existing feature PR and reinstall the verified macOS bundle.
