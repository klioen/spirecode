# SpireCode Privacy Notice

Last updated: 2026-09-18

SpireCode is a local desktop application for macOS, Windows, and Linux for
working with Git projects and local pi Agent sessions.

## Local data

SpireCode stores application state, project metadata, worktree metadata,
editor tab metadata, settings, and bounded diagnostic logs in the operating
system's application-data directory for the app (Application Support on macOS,
AppData on Windows, and the platform Electron data directory on Linux). File
contents, Git diffs, Chat transcripts, and Terminal output are read or rendered
locally as needed.

Editor tab persistence stores only resource metadata such as relative paths,
diff scopes, Chat session IDs, titles, and active tab IDs. It does not store
file contents or unsaved drafts.

## Agent and user-installed resources

SpireCode does not bundle packages or extensions from
`github:klioen/pi-extensions`. Resources that users install and declare through
standard Pi settings—including packages, extensions, skills, prompts, and
themes—are resolved by the pi Agent SDK. Agent tools and executable resources
run with the permissions of the current operating-system user. They may read or
modify local files, run commands, start subprocesses, or access network services
according to their configuration. The worktree directory is not an
operating-system security sandbox.

## Network

SpireCode does not provide a SpireCode telemetry service in this release.
Agent/provider network requests are made by pi and its configured providers.
The optional “Send feedback” action opens the public GitHub Issues page in
the user's browser; it does not upload a diagnostic report automatically.

## Diagnostics

“Copy diagnostics” produces a local, redacted report containing app/runtime
versions and a bounded tail of local logs. It excludes credentials, API keys,
environment variables, file contents, prompts, tool arguments/results, and
Terminal input. Users choose what to share.

## Contact

For privacy questions, use the repository's documented project contact or
open an issue on the project page.
