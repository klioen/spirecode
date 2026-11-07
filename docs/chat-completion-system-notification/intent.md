# Intent: Chat completion system notification

Pi responses can finish while SpireCode is minimized or behind another application. Users need an operating-system notification when a normal Chat session has fully settled so they can return without watching the window.

## Outcome

- Notify after Pi has completed the whole turn, not merely after one model response ends.
- Use the Chat session title and localized completion copy.
- Restore and focus SpireCode when the notification is clicked.
- Avoid duplicate Task notifications and avoid notifying while the window is already visible and focused.
