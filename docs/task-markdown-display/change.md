# Task Markdown display

## Intent

Render task requirement text as safe, readable Markdown in the task detail, intake proposal review, and AI rewrite comparison surfaces. The stored description and task workflows remain unchanged.

Risk classification: standard change because it alters user-visible behavior across three Renderer components, while reusing the existing Markdown security and interaction boundary without changing APIs, persistence, or Electron privileges.

## Spec

- Reuse the existing `MarkdownContent` React/GFM renderer for all three task surfaces.
- Preserve raw HTML as inert text, suppress Markdown images, reject dangerous link protocols, confirm external links, and retain fenced-code language labels and copy controls.
- Keep each surface's current headings, controls, disclosure behavior, and responsive layout.
- Add task-specific, theme-aware typography for headings, paragraphs, lists, task lists, tables, quotes, rules, inline code, and fenced code.
- Long words and prose wrap; wide tables and code scroll within their content area instead of widening cards or comparison columns.
- Keep the localized empty-description fallback in `TaskDetail`.
- Do not change task storage, forms, submission, or backend contracts.

## Plan

1. Add integration tests for semantic Markdown rendering and safety at each requested task surface.
2. Add a lightweight class-name customization point to the shared renderer if task-scoped styling needs it.
3. Replace plain description nodes with the shared renderer while preserving surrounding structure and behavior.
4. Add responsive task Markdown styles and remove obsolete plain-text-only rules.
5. Run focused tests, formatting, lint, typecheck, and the project verification gate; inspect the final diff for scope and security regressions.
