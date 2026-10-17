import { createHash } from "node:crypto";
import { homedir } from "node:os";
import { readFile, realpath } from "node:fs/promises";
import path from "node:path";
import {
  DefaultResourceLoader,
  SettingsManager,
  type ResolvedResource,
  type ResourceDiagnostic,
  type Skill,
} from "@earendil-works/pi-coding-agent";
import { AsyncQueue } from "../../core/asyncQueue.js";
import { CommandError } from "../../core/errors.js";
import { loadOrDefault, saveAtomic } from "../persistence/index.js";
import {
  resolveSpireExtensions,
  resolveSpireResources,
} from "../chat/spireSettings.js";

export type ExtensionSource = "pi" | "package";
export type ExtensionScope = "global" | "project";
export type AppLanguage = "en" | "zh-CN";

export interface ExtensionSetting {
  id: string;
  name: string;
  kind: "user";
  source: ExtensionSource;
  scope: ExtensionScope;
  displayPath: string;
  enabled: boolean;
  status: "enabled" | "disabled";
}

export interface SkillSetting {
  id: string;
  name: string;
  description: string;
  kind: "builtin" | "user" | "project";
  displayPath: string;
  enabled: boolean;
  status: "enabled" | "disabled";
  disableModelInvocation: boolean;
}

interface SkillsResult {
  skills: Skill[];
  diagnostics: ResourceDiagnostic[];
}

export type MemoryReasoningEffort =
  "off" | "minimal" | "low" | "medium" | "high" | "xhigh" | "max";

export interface MemoryConfig {
  phase1Provider: string;
  phase1ModelId: string;
  phase1ReasoningEffort: MemoryReasoningEffort;
  phase2Provider: string;
  phase2ModelId: string;
  phase2ReasoningEffort: MemoryReasoningEffort;
}

interface SettingsState {
  version: 8;
  language: AppLanguage;
  memoryConfig: MemoryConfig | null;
  skillOverrides: Record<string, boolean>;
}

const MEMORY_REASONING_EFFORTS = new Set<MemoryReasoningEffort>([
  "off",
  "minimal",
  "low",
  "medium",
  "high",
  "xhigh",
  "max",
]);

interface Candidate {
  path: string;
  loadRoot?: string;
  packageName?: string;
  packageVersion?: string;
  kind: "user";
  source: ExtensionSource;
  scope: ExtensionScope;
  defaultEnabled: boolean;
}

export class SettingsService {
  private readonly queue = new AsyncQueue();
  private constructor(
    private readonly statePath: string,
    private readonly agentDir: string,
    private readonly spireSettingsPath: string,
    private state: SettingsState,
  ) {}

  static async load(
    statePath: string,
    agentDir = path.join(homedir(), ".pi", "agent"),
    spireSettingsPath = path.join(homedir(), ".spirecode", "settings.json"),
  ): Promise<SettingsService> {
    const loaded = await loadOrDefault<unknown>(statePath, () => ({
      version: 8,
      language: "en",
      memoryConfig: null,
      skillOverrides: {},
    }));
    const state = sanitizeState(loaded);
    await saveAtomic(statePath, state);
    return new SettingsService(statePath, agentDir, spireSettingsPath, state);
  }

  language(): Promise<AppLanguage> {
    return this.queue.run(async () => this.state.language);
  }

  currentLanguage(): AppLanguage {
    return this.state.language;
  }

  setLanguage(language: AppLanguage): Promise<AppLanguage> {
    return this.queue.run(async () => {
      if (language !== "en" && language !== "zh-CN")
        throw new CommandError("INVALID_ARGUMENT", "language is invalid");
      const next: SettingsState = { ...this.state, language };
      await saveAtomic(this.statePath, next);
      this.state = next;
      return language;
    });
  }

  list(cwd: string): Promise<ExtensionSetting[]> {
    return this.queue.run(async () => this.catalog(cwd, true));
  }

  listSkills(cwd: string): Promise<SkillSetting[]> {
    return this.queue.run(async () => this.skillCatalog(await realpath(cwd)));
  }

  setSkillEnabled(
    cwd: string,
    requestedId: string,
    enabled: boolean,
  ): Promise<SkillSetting[]> {
    return this.queue.run(async () => {
      const canonicalCwd = await realpath(cwd);
      const result = await this.loadSkills(canonicalCwd);
      const skill = result.skills.find(
        (candidate) => this.skillId(candidate, canonicalCwd) === requestedId,
      );
      if (!skill) throw new CommandError("NOT_FOUND", "skill not found");
      const next: SettingsState = {
        ...this.state,
        skillOverrides: {
          ...this.state.skillOverrides,
          [requestedId]: enabled,
        },
      };
      await saveAtomic(this.statePath, next);
      this.state = next;
      return this.skillCatalogFrom(result.skills, canonicalCwd);
    });
  }

  async skillSelection(cwd: string): Promise<{
    paths: string[];
    override: (result: SkillsResult) => SkillsResult;
  }> {
    return this.queue.run(async () => {
      const canonicalCwd = await realpath(cwd);
      const result = await this.loadSkills(canonicalCwd);
      const allowedPaths = new Set(
        result.skills.map((skill) => path.resolve(skill.filePath)),
      );
      const disabledPaths = new Set(
        result.skills
          .filter(
            (skill) =>
              this.state.skillOverrides[this.skillId(skill, canonicalCwd)] ===
              false,
          )
          .map((skill) => path.resolve(skill.filePath)),
      );
      return {
        paths: result.skills
          .filter((skill) => this.skillKind(skill) !== "builtin")
          .map((skill) => skill.filePath),
        override: (loaded) => ({
          ...loaded,
          skills: loaded.skills.filter((skill) => {
            const skillPath = path.resolve(skill.filePath);
            return allowedPaths.has(skillPath) && !disabledPaths.has(skillPath);
          }),
        }),
      };
    });
  }

  memoryConfig(): Promise<MemoryConfig | null> {
    return this.queue.run(async () =>
      this.state.memoryConfig ? { ...this.state.memoryConfig } : null,
    );
  }

  setMemoryConfig(
    phase1Provider: string,
    phase1ModelId: string,
    phase1ReasoningEffort: MemoryReasoningEffort,
    phase2Provider: string,
    phase2ModelId: string,
    phase2ReasoningEffort: MemoryReasoningEffort,
  ): Promise<MemoryConfig> {
    return this.queue.run(async () => {
      const memoryConfig = validateMemoryConfig({
        phase1Provider,
        phase1ModelId,
        phase1ReasoningEffort,
        phase2Provider,
        phase2ModelId,
        phase2ReasoningEffort,
      });
      const next: SettingsState = { ...this.state, memoryConfig };
      await saveAtomic(this.statePath, next);
      this.state = next;
      return { ...memoryConfig };
    });
  }

  private async loadSkills(cwd: string): Promise<SkillsResult> {
    const layered = await resolveSpireResources(cwd, {
      piSettingsPath: path.join(this.agentDir, "settings.json"),
      spireSettingsPath: this.spireSettingsPath,
    });
    const loader = new DefaultResourceLoader({
      cwd,
      agentDir: this.agentDir,
      // ProjectService supplies cwd only for a project the user explicitly opened.
      // That existing trust boundary already grants Agent tools access to the worktree.
      settingsManager: SettingsManager.create(cwd, this.agentDir, {
        projectTrusted: true,
      }),
      noExtensions: true,
      additionalSkillPaths: layered.skills
        .filter(({ enabled }) => enabled)
        .map(({ path: skillPath }) => skillPath),
      noPromptTemplates: true,
      noThemes: true,
      noContextFiles: true,
    });
    await loader.reload();
    const result = loader.getSkills();
    const canonicalCwd = await realpath(cwd);
    const skills: Skill[] = [];
    const diagnostics = [...result.diagnostics];
    for (const skill of result.skills) {
      const canonicalFile = await realpath(skill.filePath);
      if (
        skill.sourceInfo.scope === "project" &&
        !isWithin(canonicalCwd, canonicalFile)
      ) {
        diagnostics.push({
          type: "warning",
          message: `Ignored project skill outside worktree: ${skill.name}`,
          path: skill.filePath,
        });
        continue;
      }
      skills.push({
        ...skill,
        filePath: canonicalFile,
        baseDir: await realpath(skill.baseDir),
        sourceInfo: { ...skill.sourceInfo, path: canonicalFile },
      });
    }
    return { skills, diagnostics };
  }

  private async skillCatalog(cwd: string): Promise<SkillSetting[]> {
    const result = await this.loadSkills(cwd);
    const errors = result.diagnostics.filter(({ type }) => type === "error");
    if (errors.length > 0)
      throw new Error(errors.map(({ message }) => message).join("; "));
    return this.skillCatalogFrom(result.skills, cwd);
  }

  private skillCatalogFrom(skills: Skill[], cwd: string): SkillSetting[] {
    return skills
      .map((skill) => {
        const id = this.skillId(skill, cwd);
        const kind = this.skillKind(skill);
        const enabled = this.state.skillOverrides[id] ?? true;
        return {
          id,
          name: skill.name,
          description: skill.description,
          kind,
          displayPath: this.skillDisplayPath(skill, cwd, kind),
          enabled,
          status: enabled ? "enabled" : "disabled",
          disableModelInvocation: skill.disableModelInvocation,
        } satisfies SkillSetting;
      })
      .sort((left, right) =>
        `${skillKindOrder(left.kind)}:${left.name}`.localeCompare(
          `${skillKindOrder(right.kind)}:${right.name}`,
        ),
      );
  }

  private skillKind(skill: Skill): SkillSetting["kind"] {
    return skill.sourceInfo.scope === "project" ? "project" : "user";
  }

  private skillId(skill: Skill, cwd: string): string {
    const kind = this.skillKind(skill);
    const identity =
      kind === "builtin"
        ? `pi-sdlc:${skill.name}`
        : kind === "project"
          ? path.relative(cwd, skill.filePath)
          : skill.filePath;
    return createHash("sha256")
      .update(`skill\0${kind}\0${identity}`)
      .digest("hex")
      .slice(0, 24);
  }

  private skillDisplayPath(
    skill: Skill,
    cwd: string,
    kind: SkillSetting["kind"],
  ): string {
    if (kind === "builtin") return "pi-sdlc";
    if (kind === "project")
      return portablePath(path.relative(cwd, skill.filePath));
    const abbreviated = abbreviateHome(skill.filePath);
    return abbreviated.startsWith("~")
      ? abbreviated
      : `external/${path.basename(skill.baseDir)}/${path.basename(skill.filePath)}`;
  }

  private async catalog(
    cwd: string,
    strict = false,
  ): Promise<ExtensionSetting[]> {
    const candidates = await this.candidates(cwd, strict);
    return candidates
      .map((candidate) => {
        const id = extensionId(candidate);
        const enabled = candidate.defaultEnabled;
        return {
          id,
          name:
            candidate.source === "package"
              ? (candidate.packageName ?? extensionName(candidate.path))
              : extensionName(candidate.path),
          ...(candidate.packageVersion
            ? { version: candidate.packageVersion }
            : {}),
          kind: candidate.kind,
          source: candidate.source,
          scope: candidate.scope,
          displayPath: abbreviateHome(candidate.path),
          enabled,
          status: enabled ? "enabled" : "disabled",
        } satisfies ExtensionSetting;
      })
      .sort((left, right) =>
        `${left.kind}:${left.name}`.localeCompare(
          `${right.kind}:${right.name}`,
        ),
      );
  }

  private async candidates(cwd: string, strict: boolean): Promise<Candidate[]> {
    const candidates: Candidate[] = [];

    try {
      for (const resource of await resolveSpireExtensions(cwd, {
        piSettingsPath: path.join(this.agentDir, "settings.json"),
      })) {
        const candidate = await fromPiResource(resource);
        if (candidate) candidates.push(candidate);
      }
    } catch (error) {
      if (strict) throw error;
      console.warn("Unable to resolve user Pi extensions", error);
    }

    const unique = new Map<string, Candidate>();
    for (const candidate of candidates) {
      const normalized = path.resolve(candidate.path);
      const key = `${candidate.source}:${candidate.scope}:${normalized}`;
      if (!unique.has(key))
        unique.set(key, {
          ...candidate,
          path: normalized,
          ...(candidate.loadRoot
            ? { loadRoot: path.resolve(candidate.loadRoot) }
            : {}),
        });
    }
    return [...unique.values()];
  }
}

async function fromPiResource(
  resource: ResolvedResource,
): Promise<Candidate | undefined> {
  if (
    resource.metadata.scope === "project" ||
    resource.metadata.source === "auto"
  )
    return undefined;
  const canonicalPath = await realpath(resource.path);
  return {
    path: canonicalPath,
    ...(resource.metadata.baseDir
      ? { loadRoot: await realpath(resource.metadata.baseDir) }
      : {}),
    ...(resource.metadata.origin === "package" && resource.metadata.baseDir
      ? await packageMetadataAt(resource.metadata.baseDir)
      : {}),
    kind: "user",
    source: resource.metadata.origin === "package" ? "package" : "pi",
    scope: "global",
    defaultEnabled: resource.enabled,
  };
}

async function packageMetadataAt(
  value: string,
): Promise<{ packageName?: string; packageVersion?: string }> {
  try {
    const manifest = JSON.parse(
      await readFile(path.join(value, "package.json"), "utf8"),
    ) as { name?: unknown; version?: unknown };
    return {
      ...(typeof manifest.name === "string"
        ? { packageName: manifest.name }
        : {}),
      ...(typeof manifest.version === "string"
        ? { packageVersion: manifest.version }
        : {}),
    };
  } catch {
    return {};
  }
}

function extensionId(candidate: Candidate): string {
  return createHash("sha256")
    .update(`${candidate.source}\0${candidate.scope}\0${candidate.path}`)
    .digest("hex")
    .slice(0, 24);
}

function extensionName(extensionPath: string): string {
  const parsed = path.parse(extensionPath);
  return parsed.name === "index" ? path.basename(parsed.dir) : parsed.name;
}

function abbreviateHome(value: string): string {
  const home = homedir();
  return portablePath(
    value === home || value.startsWith(home + path.sep)
      ? `~${value.slice(home.length)}`
      : value,
  );
}

function validateMemoryConfig(value: MemoryConfig): MemoryConfig {
  for (const provider of [value.phase1Provider, value.phase2Provider]) {
    if (
      !/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(provider) ||
      Buffer.byteLength(provider, "utf8") > 128
    )
      throw new CommandError("INVALID_ARGUMENT", "provider is invalid");
  }
  for (const modelId of [value.phase1ModelId, value.phase2ModelId]) {
    if (
      !modelId ||
      modelId.trim() !== modelId ||
      [...modelId].some((character) => {
        const code = character.charCodeAt(0);
        return code <= 31 || (code >= 127 && code <= 159);
      }) ||
      Buffer.byteLength(modelId, "utf8") > 256
    )
      throw new CommandError("INVALID_ARGUMENT", "modelId is invalid");
  }
  if (
    !MEMORY_REASONING_EFFORTS.has(value.phase1ReasoningEffort) ||
    !MEMORY_REASONING_EFFORTS.has(value.phase2ReasoningEffort)
  )
    throw new CommandError("INVALID_ARGUMENT", "reasoningEffort is invalid");
  return { ...value };
}

function sanitizeState(value: unknown): SettingsState {
  const record =
    value && typeof value === "object"
      ? (value as Record<string, unknown>)
      : ({} as Record<string, unknown>);
  let memoryConfig: MemoryConfig | null = null;
  if (record.memoryConfig && typeof record.memoryConfig === "object") {
    const candidate = record.memoryConfig as Record<string, unknown>;
    try {
      const legacyProvider = candidate.provider as string | undefined;
      const legacyModelId = candidate.modelId as string | undefined;
      memoryConfig = validateMemoryConfig({
        phase1Provider:
          (candidate.phase1Provider as string | undefined) ?? legacyProvider!,
        phase1ModelId:
          (candidate.phase1ModelId as string | undefined) ?? legacyModelId!,
        phase1ReasoningEffort:
          (candidate.phase1ReasoningEffort as
            MemoryReasoningEffort | undefined) ??
          (candidate.reasoningEffort as MemoryReasoningEffort | undefined) ??
          "low",
        phase2Provider:
          (candidate.phase2Provider as string | undefined) ?? legacyProvider!,
        phase2ModelId:
          (candidate.phase2ModelId as string | undefined) ?? legacyModelId!,
        phase2ReasoningEffort:
          (candidate.phase2ReasoningEffort as
            MemoryReasoningEffort | undefined) ?? "medium",
      });
    } catch {
      memoryConfig = null;
    }
  }
  const language: AppLanguage = record.language === "zh-CN" ? "zh-CN" : "en";
  return {
    version: 8,
    language,
    memoryConfig: memoryConfig ? { ...memoryConfig } : null,
    skillOverrides: sanitizeOverrides(record.skillOverrides),
  };
}

function sanitizeOverrides(value: unknown): Record<string, boolean> {
  const result: Record<string, boolean> = {};
  if (typeof value === "object" && value) {
    for (const [key, enabled] of Object.entries(value))
      if (/^[a-f0-9]{24}$/.test(key) && typeof enabled === "boolean")
        result[key] = enabled;
  }
  return result;
}

function isWithin(root: string, candidate: string): boolean {
  const relative = path.relative(root, candidate);
  return (
    relative === "" ||
    (!relative.startsWith("..") && !path.isAbsolute(relative))
  );
}

function skillKindOrder(kind: SkillSetting["kind"]): number {
  return kind === "builtin" ? 0 : kind === "user" ? 1 : 2;
}

function portablePath(value: string): string {
  return value.split(path.sep).join("/");
}
