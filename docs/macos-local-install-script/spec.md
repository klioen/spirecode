# Spec

- Expose `pnpm install:mac` from the repository root.
- Support macOS arm64 only and fail clearly on another host or architecture.
- Run the existing `pnpm bundle` pipeline before installation.
- Verify the staged application with strict recursive code-signature validation.
- Stop the currently installed SpireCode process before replacement.
- Replace `/Applications/SpireCode.app` through a staging path and restore the previous app if replacement or verification fails.
- Remove quarantine metadata, compare the installed `app.asar` hash with the built artifact, launch the installed app, and confirm that its main process starts.
- Do not modify application user data.
