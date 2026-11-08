# Intent: Chat completion system notification

Pi responses can finish while SpireCode is minimized, behind another application, or visible while the user is watching other work in the same window. Users need an operating-system notification when a normal Chat session has fully settled without relying on window focus as a proxy for attention.

## Outcome

- Notify after Pi has completed the whole turn, not merely after one model response ends.
- Use the Chat session title and localized completion copy.
- Restore and focus SpireCode when the notification is clicked.
- Avoid duplicate Task notifications and notify consistently regardless of window focus.
