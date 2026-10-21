# Intent

Provide one repository command that rebuilds, safely replaces, verifies, and launches the local macOS arm64 SpireCode application.

The current manual installation sequence is long and easy to execute incompletely. The script must preserve the existing application if staging or verification fails.

## Risk

High risk: this changes a local installation/replacement workflow under `/Applications` and therefore crosses a filesystem and release boundary.
