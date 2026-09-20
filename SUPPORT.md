# SpireCode Support

SpireCode is a pre-release, community-maintained project. Support is best effort; there is no paid support channel or guaranteed response time.

## Where to ask

| Need                                                                   | Channel                                                                                        |
| ---------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| Reproducible SpireCode defect                                          | [Bug report](https://github.com/klioen/spirecode/issues/new?template=bug_report.yml)           |
| Feature or design proposal                                             | [Feature request](https://github.com/klioen/spirecode/issues/new?template=feature_request.yml) |
| Setup or usage question                                                | [Support request](https://github.com/klioen/spirecode/issues/new?template=support_request.yml) |
| Security vulnerability                                                 | Follow [SECURITY.md](SECURITY.md); do not open a public issue                                  |
| Provider account, authentication, billing, rate limit, or model policy | The selected pi/provider support channel                                                       |
| Contributor workflow                                                   | [CONTRIBUTING.md](CONTRIBUTING.md)                                                             |
| Community conduct concern                                              | Private reporting instructions in [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md)                     |

If GitHub Discussions is enabled in the future, open-ended usage discussions may move there. The issue templates above are the current public channels.

## Before opening an issue

1. Search open and closed issues.
2. Read [README.md](README.md), especially installation, pi authentication, and troubleshooting.
3. Reproduce on the latest default-branch checkout when practical.
4. Run `pnpm check` if the problem occurs in a source build.
5. Remove credentials, prompts, private repository content, file contents, usernames, and absolute paths from logs and screenshots.

A useful report includes the operating system and architecture, Node and pnpm versions, the tested commit, expected and actual behavior, minimal reproduction steps, and a small redacted diagnostic excerpt when relevant.

## Development artifact warning

There are no formally signed or notarized public binaries yet. CI artifacts and local `pnpm bundle` outputs are development builds. The project cannot provide support for bypassing operating-system security controls to run an untrusted artifact.

## pi and provider boundaries

SpireCode embeds the pi Agent SDK but does not operate model providers or manage provider accounts. Authentication is performed through pi and the chosen provider. Provider outages, account access, billing, quota, rate limits, retention, and model output should be taken to that provider unless there is evidence of a SpireCode integration defect.

Never post API keys, tokens, cookies, private keys, or complete `~/.pi/agent` contents in an issue.

## Closing and triage

Maintainers may ask for a minimal reproduction, move a report to a more appropriate template, close duplicates, or close issues that cannot be reproduced. Feature requests are considered against project scope and maintainer capacity; filing a request does not commit the project to implementation.
