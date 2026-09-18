export const PI_EXTENSIONS_COMMIT = "e5937af0cd7d2f22907e6a31a2aa338c96316771";

export const BUNDLED_PACKAGES = [
  ["web-access", "pi-web-access"],
  ["subagents", "pi-subagents"],
  ["todo", "pi-todo"],
  ["plan", "pi-plan"],
  ["goal", "pi-goal"],
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
