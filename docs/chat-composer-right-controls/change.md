# Chat composer right-side controls

## Intent

Move the model and thinking-level selectors out of the left side of the chat composer footer and into the right-aligned action cluster, without changing any composer behavior.

## Spec

- Keep model selection before thinking-level selection.
- Place both selectors in the right-side action group before the optional byte counter and the send, follow-up, or stop action.
- Preserve selector, send, follow-up, stop, disabled, search, and accessibility behavior.
- Keep the action group wrappable and constrained to the composer width so narrow layouts do not overflow or hide controls.
- Do not change model controls outside `ChatComposer`.

## Plan

1. Add a layout regression test that asserts the right-side group membership and DOM order, including the byte counter.
2. Group the existing composer footer controls in a right-aligned wrapping container and adjust only the related CSS flex rules.
3. Run the focused `ChatComposer` tests, formatting, lint, type checking, and the project verification gate.

Risk: standard, because this is a localized user-visible Renderer layout change with multiple acceptance criteria and no API, persistence, or security impact.
