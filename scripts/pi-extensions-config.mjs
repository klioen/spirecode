export const PI_EXTENSIONS_COMMIT = "c664acff4107aee8714bc8b118a78df57c71ed5f";

export const BUNDLED_PACKAGES = [
  ["web-access", "pi-web-access"],
  ["subagents", "pi-subagents"],
  ["todo", "pi-todo"],
  ["plan", "pi-plan"],
  ["goal", "pi-goal"],
  ["failover", "pi-failover"],
  ["memory", "pi-memory"],
  ["sdlc", "pi-sdlc"],
];

export const ALLOWED_PACKAGE_ENTRIES = [
  "package.json",
  "extensions",
  "lib",
  "prompts",
  "worker",
  "skills",
];

export const REQUIRED_FILES = [
  "pi-memory/extensions/memory.ts",
  "pi-memory/lib/memory-core.cjs",
  "pi-memory/prompts/consolidation.md",
  "pi-memory/prompts/phase_one_system.md",
  "pi-memory/prompts/read_path.md",
  "pi-memory/worker/worker.cjs",
  "pi-sdlc/skills/sdlc-build/SKILL.md",
  "pi-sdlc/skills/sdlc-maintain/SKILL.md",
  "pi-sdlc/skills/sdlc-plan/SKILL.md",
  "pi-sdlc/skills/sdlc-review/SKILL.md",
  "pi-sdlc/skills/sdlc-test/SKILL.md",
];
