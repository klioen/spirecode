# Security Policy

## Project status and supported versions

SpireCode is pre-release software. No version is currently designated as a formally supported public release, and no signed or notarized binaries are published. Security fixes are made on a best-effort basis on the default branch.

When formal releases begin, this table will identify the supported lines:

| Version                   | Supported   |
| ------------------------- | ----------- |
| Unreleased default branch | Best effort |
| Public release versions   | None yet    |

Do not rely on development builds for high-assurance or hostile multi-user environments.

## Report a vulnerability privately

Do **not** open a public issue, discussion, pull request, or social-media post for a suspected vulnerability.

Use [GitHub's private vulnerability reporting form](https://github.com/klioen/spirecode/security/advisories/new) for this repository. If that form is unavailable to you, contact the maintainers through a private channel and include only enough non-sensitive detail to arrange a secure follow-up. Do not send credentials, private keys, access tokens, or unrelated personal data.

A useful report includes:

- affected commit or version and operating system;
- impact and realistic attack scenario;
- minimal reproduction steps or proof of concept;
- whether user interaction or a malicious repository is required;
- suggested mitigation, if known; and
- how you would like to be credited.

## Response expectations

This community project aims to:

- acknowledge a private report within 7 calendar days;
- provide an initial assessment or request more information within 14 calendar days; and
- coordinate disclosure after a fix or mitigation is available.

These are goals, not a service-level agreement. Complex issues, maintainer availability, or third-party dependencies may require more time. Please allow a reasonable remediation period before public disclosure.

## Security model

SpireCode separates a sandboxed React Renderer from privileged Electron Main capabilities. The Renderer uses an allowlisted preload bridge and addresses project files by worktree ID plus relative path. Git commands use argument arrays rather than shell command strings.

Important boundaries remain:

- Agent tools, terminals, pi extensions, Git, and native dependencies execute with the current operating-system user's authority.
- A selected worktree is execution context, not an OS security sandbox or confinement boundary.
- Extensions can introduce filesystem, process, model-provider, and network access. Treat third-party extensions as executable code.
- pi and configured model providers handle authentication and model network traffic outside SpireCode. SpireCode does not ask users to paste provider credentials into the application.
- No formally signed/notarized release artifacts or automatic updater exist yet.
- The application has not been represented as suitable for adversarial multi-tenant isolation.

Opening an untrusted repository, running commands, accepting Agent tool actions, or enabling extensions can be risky. Review repositories and prompts, use least-privilege provider credentials, and keep valuable work backed up.

## Scope

Examples of in-scope reports include:

- escaping Renderer isolation or invoking non-allowlisted Main capabilities;
- path traversal or symlink attacks that access files outside an authorized worktree;
- untrusted Git configuration causing unexpected command execution;
- credential or private-content exposure through logs or diagnostics;
- unsafe extension loading or privilege-boundary confusion; and
- release artifact or dependency integrity failures.

Usually out of scope unless they demonstrate a SpireCode vulnerability:

- provider availability, pricing, policy, or model behavior;
- social engineering without a technical flaw;
- issues requiring an already fully compromised local account;
- denial of service caused only by intentionally exhausting local resources; and
- reports generated solely by an automated scanner without reproducible impact.

## Public hardening work

The accepted readiness design is tracked in `docs/public-open-source-readiness/`, but those documents include planned work and are not evidence that every control has shipped. Security claims in this policy are intentionally limited to current, verifiable boundaries.
