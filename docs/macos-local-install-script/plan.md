# Plan

1. Add a checked-in Bash installer that packages, stages, verifies, atomically replaces, rolls back on failure, launches, and reports hashes.
2. Add a concise package script entry so installation is invoked with `pnpm install:mac`.
3. Validate the script syntax, repository checks, and a real local installation from the generated bundle.
